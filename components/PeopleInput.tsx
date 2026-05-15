import { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { Friendship } from "@/types";

export interface TaggedFriend {
  friend: Friendship;
  send: boolean;
}

interface Props {
  people: string[];
  onChangePeople: (people: string[]) => void;
  taggedFriends?: TaggedFriend[];
  onChangeTaggedFriends?: (tagged: TaggedFriend[]) => void;
  friends?: Friendship[];
}

export function PeopleInput({
  people,
  onChangePeople,
  taggedFriends = [],
  onChangeTaggedFriends,
  friends = [],
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const taggedFriendIds = new Set(taggedFriends.map((tf) => tf.friend.otherUserId));

  const matchingFriends = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return friends.filter((f) => {
      if (taggedFriendIds.has(f.otherUserId)) return false;
      return (
        (f.otherUserDisplayName ?? "").toLowerCase().includes(q) ||
        (f.otherUserUsername ?? "").toLowerCase().includes(q)
      );
    }).slice(0, 5);
  }, [query, friends, taggedFriendIds]);

  const showDropdown = focused && (matchingFriends.length > 0 || query.trim().length > 0);

  const addTextChip = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (!people.includes(trimmed)) {
      onChangePeople([...people, trimmed]);
      Haptics.selectionAsync();
    }
    setQuery("");
  };

  const addFriendChip = (friend: Friendship) => {
    if (onChangeTaggedFriends) {
      onChangeTaggedFriends([...taggedFriends, { friend, send: true }]);
      Haptics.selectionAsync();
    }
    setQuery("");
    inputRef.current?.focus();
  };

  const hasChips = people.length > 0 || taggedFriends.length > 0;

  return (
    <View>
      {hasChips && (
        <View style={styles.chips}>
          {taggedFriends.map((tf) => (
            <View key={tf.friend.otherUserId} style={[styles.chip, { backgroundColor: theme.colors.accentBg }]}>
              <Ionicons name="person" size={11} color={theme.colors.accentText} />
              <Text style={[styles.chipText, { color: theme.colors.accentText }]} numberOfLines={1}>
                {tf.friend.otherUserDisplayName ?? tf.friend.otherUserUsername ?? "Friend"}
              </Text>
              <TouchableOpacity onPress={() => onChangeTaggedFriends?.(taggedFriends.filter((t) => t.friend.otherUserId !== tf.friend.otherUserId))} hitSlop={6}>
                <Ionicons name="close" size={13} color={theme.colors.accentText} />
              </TouchableOpacity>
            </View>
          ))}
          {people.map((name) => (
            <View key={name} style={[styles.chip, { backgroundColor: theme.colors.chipBg }]}>
              <Text style={[styles.chipText, { color: theme.colors.chipText }]} numberOfLines={1}>
                {name}
              </Text>
              <TouchableOpacity onPress={() => onChangePeople(people.filter((p) => p !== name))} hitSlop={6}>
                <Ionicons name="close" size={13} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <TextInput
        ref={inputRef}
        style={[styles.input, focused && { borderColor: theme.colors.accent }]}
        placeholder="Add people…"
        placeholderTextColor={theme.colors.placeholder}
        cursorColor={theme.colors.accent}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); addTextChip(); }}
        onSubmitEditing={addTextChip}
      />

      {showDropdown && (
        <View style={[styles.dropdown, { backgroundColor: theme.colors.backgroundSecondary, borderColor: theme.colors.border }]}>
          {matchingFriends.map((friend, i) => (
            <TouchableOpacity
              key={friend.otherUserId}
              style={[
                styles.dropdownRow,
                i < matchingFriends.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
              ]}
              onPress={() => addFriendChip(friend)}
              activeOpacity={0.7}
            >
              <Ionicons name="person-circle-outline" size={18} color={theme.colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.dropdownName, { color: theme.colors.text }]} numberOfLines={1}>
                  {friend.otherUserDisplayName ?? friend.otherUserUsername ?? "Friend"}
                </Text>
                {friend.otherUserUsername && (
                  <Text style={[styles.dropdownUsername, { color: theme.colors.textSecondary }]}>
                    @{friend.otherUserUsername}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
          {query.trim().length > 0 && (
            <TouchableOpacity
              style={[
                styles.dropdownRow,
                matchingFriends.length > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
              ]}
              onPress={addTextChip}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={18} color={theme.colors.textSecondary} />
              <Text style={[styles.dropdownAdd, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                Add "{query.trim()}"
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    chips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.sm,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 6,
      borderRadius: theme.radii.lg,
      gap: 5,
      maxWidth: 200,
    },
    chipText: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.medium,
      flexShrink: 1,
    },
    input: {
      height: 48,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingHorizontal: theme.spacing.lg,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      backgroundColor: theme.colors.backgroundInput,
    },
    dropdown: {
      marginTop: theme.spacing.xs,
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: "hidden",
    },
    dropdownRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 11,
    },
    dropdownName: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.medium,
    },
    dropdownUsername: {
      fontSize: theme.fontSize.xs,
    },
    dropdownAdd: {
      fontSize: theme.fontSize.sm,
      flexShrink: 1,
    },
  });
}
