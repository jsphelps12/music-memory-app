import { useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { TextInputInstance } from "react-native";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { Chip } from "@/components/Chip";
import { ListRow } from "@/components/ListRow";
import { TextField } from "@/components/TextField";
import { useAuth } from "@/contexts/AuthContext";
import { useFriends } from "@/hooks/useFriends";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { fetchBrowseMetadata } from "@/lib/browse";
import { BROWSE_META_STALE } from "@/lib/queryConfig";
import {
  buildKnownNames,
  hasName,
  offerAddTyped,
  peopleSuggestions,
  recentNames,
  resolveName,
  type PeopleSuggestion,
} from "@/lib/people";

// Free-text chips only (Social Architecture v2): this field is a personal
// "who was there" memory aid. Sending a moment to a person lives in the share
// sheet, not here. Suggestions come from the names on past moments and
// friends' display names, matched ignoring case, and a typed name that
// matches one ("sam") is saved in the existing spelling ("Sam"), so one
// person doesn't split into two in Rediscover. Nothing here links a name to
// an account.
interface Props {
  people: string[];
  onChangePeople: (people: string[]) => void;
}

export function PeopleInput({ people, onChangePeople }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
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
  const known = useMemo(
    () => buildKnownNames(meta ?? [], (friends ?? []).map((f) => f.otherUserDisplayName)),
    [meta, friends]
  );

  const add = (name: string) => {
    const resolved = resolveName(name, known);
    if (resolved && !hasName(people, resolved)) {
      onChangePeople([...people, resolved]);
      Haptics.selectionAsync();
    }
    setQuery("");
  };

  // Return, blur and the "Add" row all commit what's typed, so a name is
  // never lost by closing the sheet.
  const addTyped = () => {
    if (query.trim()) add(query);
  };

  const trimmed = query.trim();
  const suggestions = useMemo(() => peopleSuggestions(known, query, people), [known, query, people]);
  const recents = useMemo(() => recentNames(known, people), [known, people]);
  const showAddTyped = offerAddTyped(query, people, suggestions);

  const renderSuggestion = (s: PeopleSuggestion, last: boolean) => {
    switch (s.kind) {
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

  return (
    <View>
      {people.length > 0 && (
        <View style={styles.chips}>
          {people.map((name) => (
            <Chip
              key={name}
              label={name}
              variant="filled"
              onRemove={() => onChangePeople(people.filter((p) => p !== name))}
            />
          ))}
        </View>
      )}

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
        onFocus={() => setFocused(true)}
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
              label={`Add “${trimmed}”`}
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
  });
}
