import { useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { TextInputInstance } from "react-native";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { usePostHog } from "posthog-react-native";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { ListRow } from "@/components/ListRow";
import { PersonPicker, PersonRow } from "@/components/PersonPicker";
import { SectionLabel } from "@/components/SectionLabel";
import { TextField } from "@/components/TextField";
import { useAuth } from "@/contexts/AuthContext";
import { useFriends } from "@/hooks/useFriends";
import { usePeopleLinks } from "@/hooks/usePeopleLinks";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { fetchBrowseMetadata } from "@/lib/browse";
import { friendsAsPeople } from "@/lib/friends";
import { linkForName, normalizeLinks } from "@/lib/momentPeopleLinks";
import { BROWSE_META_STALE } from "@/lib/queryConfig";
import { getPublicPhotoUrl } from "@/lib/storage";
import {
  buildKnownNames,
  friendsForName,
  hasName,
  linkedNamesByFriend,
  nameForFriend,
  nameKey,
  offerAddTyped,
  peopleSuggestions,
  personLabel,
  rankPeople,
  recentNames,
  resolveName,
  whoWasThereSuggestions,
  type FriendCandidate,
  type PeopleSuggestion,
} from "@/lib/people";
import type { PersonLink } from "@/types";

// "Who was there": the owner's own memory aid. Names are free text on the
// moment (`people`), matched ignoring case so "sam" is saved as the existing
// "Sam" and one person doesn't split in two in Rediscover.
//
// Linking (ROADMAP "Who was there → friends"): typing also suggests friends
// (photo, name, @handle, so two Sams are told apart). Picking one adds the
// name and links it to their account in moment_people_links, private to the
// owner: the friend is never told unless sent the moment. Tapping a chip
// links a plain name (or changes or removes a link). Sending a moment lives
// in the share sheet, not here.
//
// Linking is on only when the caller passes `onChangeLinks` and the table
// exists (lib/momentPeopleLinks.ts). Otherwise this is exactly the plain-text
// field it was: friends' display names are offered as names.
interface Props {
  people: string[];
  onChangePeople: (people: string[]) => void;
  /** Names in `people` linked to friends. */
  links?: PersonLink[];
  /** Omit to keep every name plain text. */
  onChangeLinks?: (links: PersonLink[]) => void;
}

export function PeopleInput({ people, onChangePeople, links: linksProp, onChangeLinks }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { user } = useAuth();
  const posthog = usePostHog();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  // The chip whose link is being chosen (inline, under the chips).
  const [linkingName, setLinkingName] = useState<string | null>(null);
  const inputRef = useRef<TextInputInstance>(null);

  // The same caches Rediscover and the friends list read, so this costs no
  // request when they're warm.
  const { data: meta } = useQuery({
    queryKey: ["browseMeta", user?.id],
    queryFn: () => fetchBrowseMetadata(user!.id),
    enabled: !!user,
    staleTime: BROWSE_META_STALE,
  });
  const { data: friends } = useFriends();
  const { data: linkData } = usePeopleLinks({ enabled: !!onChangeLinks });
  const linking = !!onChangeLinks && linkData?.available === true;
  const links = useMemo(() => (linking ? linksProp ?? [] : []), [linking, linksProp]);

  // Friends as suggestions, with the names the owner linked them as before.
  const candidates = useMemo<FriendCandidate[]>(() => {
    if (!linking) return [];
    const usage = linkedNamesByFriend(linkData?.links ?? []);
    return rankPeople(friendsAsPeople(friends ?? [])).map((f) => ({
      id: f.id,
      displayName: f.displayName,
      username: f.username,
      avatarPath: f.avatarPath,
      linkedNames: usage.get(f.id)?.names ?? [],
      linkCount: usage.get(f.id)?.count ?? 0,
    }));
  }, [linking, linkData, friends]);
  const friendById = useMemo(() => new Map(candidates.map((f) => [f.id, f])), [candidates]);

  // With linking on, friends are offered as themselves, not as plain names.
  const known = useMemo(
    () => buildKnownNames(meta ?? [], linking ? [] : (friends ?? []).map((f) => f.otherUserDisplayName)),
    [meta, friends, linking]
  );

  const change = (nextPeople: string[], nextLinks: PersonLink[]) => {
    if (nextPeople !== people) onChangePeople(nextPeople);
    if (linking) onChangeLinks?.(normalizeLinks(nextPeople, nextLinks));
  };

  const add = (name: string) => {
    const resolved = resolveName(name, known);
    if (resolved && !hasName(people, resolved)) {
      onChangePeople([...people, resolved]);
      Haptics.selectionAsync();
    }
    setQuery("");
  };

  /** Link `name` (on the moment, or added now) to this friend. */
  const linkTo = (name: string, friendId: string, nextPeople: string[], source: "suggestion" | "chip") => {
    const key = nameKey(name);
    // The source only: never the name or who it's linked to.
    posthog?.capture("person_linked", { source });
    change(nextPeople, [
      ...links.filter((l) => l.friendId !== friendId && nameKey(l.name) !== key),
      { name, friendId },
    ]);
    Haptics.selectionAsync();
  };

  const pickFriend = (friend: FriendCandidate) => {
    setQuery("");
    const choice = nameForFriend({ friend, people, links, known });
    if (!choice) return;
    linkTo(choice.name, friend.id, choice.existing ? people : [...people, choice.name], "suggestion");
  };

  const remove = (name: string) => {
    const key = nameKey(name);
    if (linkingName && nameKey(linkingName) === key) setLinkingName(null);
    change(
      people.filter((p) => p !== name),
      links.filter((l) => nameKey(l.name) !== key)
    );
  };

  const unlink = (name: string) => {
    const key = nameKey(name);
    change(people, links.filter((l) => nameKey(l.name) !== key));
    setLinkingName(null);
  };

  // Return, blur and the "Add" row all commit what's typed, so a name is
  // never lost by closing the sheet.
  const addTyped = () => {
    if (query.trim()) add(query);
  };

  const trimmed = query.trim();
  const suggestions = useMemo(
    () =>
      linking
        ? whoWasThereSuggestions({
            known,
            query,
            people,
            friends: candidates,
            linkedFriendIds: links.map((l) => l.friendId),
          })
        : peopleSuggestions(known, query, people),
    [linking, known, query, people, candidates, links]
  );
  const recents = useMemo(() => recentNames(known, people), [known, people]);
  const showAddTyped = offerAddTyped(query, people, suggestions);
  const canLinkChips = linking && candidates.length > 0;

  const renderSuggestion = (s: PeopleSuggestion, last: boolean) => {
    switch (s.kind) {
      case "friend":
        return (
          <PersonRow
            key={s.key}
            person={s.friend}
            showHandle
            compact
            onPress={() => pickFriend(s.friend)}
            accessibilityLabel={`Add ${s.label}${s.friend.username ? `, @${s.friend.username}` : ""}`}
            accessibilityHint="Adds your friend to this moment. They aren't told."
            last={last}
          />
        );
      case "name":
        return (
          <ListRow
            key={s.key}
            label={s.label}
            icon="person-outline"
            accessory="none"
            onPress={() => add(s.label)}
            accessibilityLabel={`Add ${s.label}`}
            last={last}
            style={styles.row}
          />
        );
    }
  };

  // The inline chooser for one chip: its current friend (with Unlink), then
  // friends to link it to, best matches for the name first.
  const linkingLink = linkingName ? linkForName(links, linkingName) : undefined;
  const linkingFriend = linkingLink ? friendById.get(linkingLink.friendId) : undefined;
  const linkChoices = useMemo(
    () =>
      linkingName
        ? friendsForName(
            candidates.filter((f) => f.id !== linkingLink?.friendId),
            linkingName
          )
        : [],
    [linkingName, candidates, linkingLink?.friendId]
  );

  return (
    <View>
      {people.length > 0 && (
        <View style={styles.chips}>
          {people.map((name) => {
            const link = linking ? linkForName(links, name) : undefined;
            const friend = link ? friendById.get(link.friendId) : undefined;
            return (
              <Chip
                key={name}
                label={name}
                variant="filled"
                selected={linkingName === name}
                imageUri={friend?.avatarPath ? getPublicPhotoUrl(friend.avatarPath) : null}
                imageRound
                icon={link ? "person" : undefined}
                onPress={
                  canLinkChips ? () => setLinkingName((current) => (current === name ? null : name)) : undefined
                }
                accessibilityHint={
                  canLinkChips
                    ? link
                      ? `Linked to ${friend ? personLabel(friend) : "a friend"}. Changes the link`
                      : "Links this name to a friend"
                    : undefined
                }
                onRemove={() => remove(name)}
              />
            );
          })}
        </View>
      )}

      {linkingName && canLinkChips ? (
        <View style={styles.linkPanel} testID="people-link-panel">
          <SectionLabel
            right={
              <Button
                label="Done"
                variant="text"
                size="pill"
                style={styles.labelAction}
                onPress={() => setLinkingName(null)}
              />
            }
          >
            {`Who is “${linkingName}”?`}
          </SectionLabel>
          {linkingFriend ? (
            <PersonRow
              person={linkingFriend}
              showHandle
              compact
              trailing={
                <Button
                  label="Unlink"
                  variant="text"
                  tone="secondary"
                  size="pill"
                  onPress={() => unlink(linkingName)}
                  accessibilityLabel={`Unlink ${linkingName} from ${personLabel(linkingFriend)}`}
                />
              }
              last={linkChoices.length === 0}
            />
          ) : null}
          <PersonPicker
            mode="inline"
            people={linkChoices}
            handles="always"
            searchPlaceholder="Search friends"
            onPick={(f) => {
              linkTo(linkingName, f.id, people, "chip");
              setLinkingName(null);
            }}
            rowAccessibilityLabel={(f) => `Link ${linkingName} to ${personLabel(f)}`}
            rowAccessibilityHint="Only you see this. They aren't told."
          />
        </View>
      ) : null}

      <TextField
        ref={inputRef}
        icon="person-add-outline"
        placeholder="Add people"
        accessibilityLabel="Add a person"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        onFocus={() => {
          setFocused(true);
          setLinkingName(null);
        }}
        onBlur={() => {
          setFocused(false);
          addTyped();
        }}
        onSubmitEditing={addTyped}
      />

      {/* Nothing typed yet: the names used most recently, one tap each. */}
      {focused && !trimmed && recents.length > 0 ? (
        <View style={[styles.chips, styles.recents]} accessibilityLabel="Recent people">
          {recents.map((k) => (
            <Chip
              key={k.key}
              label={k.name}
              variant="add"
              onPress={() => add(k.name)}
              accessibilityHint="Adds this person"
            />
          ))}
        </View>
      ) : null}

      {focused && trimmed ? (
        <View style={styles.list}>
          {suggestions.map((s, i) => renderSuggestion(s, !showAddTyped && i === suggestions.length - 1))}
          {showAddTyped ? (
            <ListRow
              label={linking ? `Add “${trimmed}” as a name` : `Add “${trimmed}”`}
              icon="add"
              accessory="none"
              onPress={addTyped}
              last
              style={styles.row}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    chips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    recents: {
      marginTop: theme.spacing.md,
      marginBottom: 0,
    },
    list: {
      marginTop: theme.spacing.xs,
    },
    row: {
      minHeight: 48,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.xs,
    },
    linkPanel: {
      marginBottom: theme.spacing.md,
    },
    // A text action inside a section label: no taller than the label row.
    labelAction: {
      minHeight: 28,
      paddingHorizontal: 0,
    },
  });
}
