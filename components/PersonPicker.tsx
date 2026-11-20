import { Fragment, ReactElement, ReactNode, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import type { TextInputInstance } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { ListRow } from "@/components/ListRow";
import { TextField } from "@/components/TextField";
import { filterPeople, idsNeedingHandle, personLabel } from "@/lib/people";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

/** A search field appears once a list has more people than this. */
export const PICKER_SEARCH_THRESHOLD = 8;
/** Rows an inline picker shows before "Show all". */
export const PICKER_INLINE_LIMIT = 5;

/** Whether a picker of `count` people shows its search field. */
export function pickerHasSearch(count: number, threshold = PICKER_SEARCH_THRESHOLD): boolean {
  return count > threshold;
}

export interface PickerPerson {
  /** Unique per row (a user id, or a free-text name). */
  id: string;
  displayName: string | null;
  username?: string | null;
  /** Stored avatar path from the profile row. */
  avatarPath?: string | null;
  /** A short value on the right, e.g. a moment count. */
  detail?: string;
}

interface Props<T extends PickerPerson> {
  /**
   * inline: inside a sheet next to other content. At most `inlineLimit` rows,
   * then "Show all", so the sheet stays sized to its other rows.
   * list: a screen, or a sheet whose only job is the list. Virtualized.
   */
  mode: "inline" | "list";
  /** Already in the order to show (lib/people.ts `rankPeople`). */
  people: readonly T[];
  loading?: boolean;
  /** A friendly message (`friendlyError`) when the list didn't load. */
  error?: string;
  onRetry?: () => void;
  /** Shown when there's nobody at all (not for a search with no match). */
  emptyState?: ReactNode;
  /** A tap on the row. */
  onPick?: (person: T) => void;
  /** Whether a row is still a button (e.g. not once it's been sent to). */
  canPick?: (person: T) => boolean;
  onLongPress?: (person: T) => void;
  /** Right side of a row (a Send pill, Remove); replaces detail + chevron. */
  renderTrailing?: (person: T) => ReactNode;
  /** Wraps a row, e.g. in the native long-press menu. */
  wrapRow?: (person: T, row: ReactElement) => ReactElement;
  /** VoiceOver label for a row (default: the name). */
  rowAccessibilityLabel?: (person: T) => string;
  rowAccessibilityHint?: string;
  /** Leading avatar (default true). Free-text names have none. */
  avatars?: boolean;
  /** @handle under the name: always, or only when two names match (default). */
  handles?: "always" | "duplicates";
  searchThreshold?: number;
  inlineLimit?: number;
  searchPlaceholder?: string;
  /**
   * Inline only: "Show all" opens the full list (with what's typed), rather
   * than growing the sheet.
   */
  onShowAll?: (query: string) => void;
  initialQuery?: string;
  autoFocusSearch?: boolean;
  /** List only: fixed content above the search field. */
  header?: ReactNode;
  /** List only: after the last row. */
  footer?: ReactNode;
  refreshControl?: ReactElement<any>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The one way to pick a person (DESIGN.md, Components): the share sheet's
 * "Send to a person", the friends list, album members and Rediscover's People.
 * Rows are `ListRow` with an `Avatar`; the search is `TextField`. Order is
 * the caller's (recent sends, then A–Z, for friends).
 */
export function PersonPicker<T extends PickerPerson>({
  mode,
  people,
  loading = false,
  error,
  onRetry,
  emptyState,
  onPick,
  canPick,
  onLongPress,
  renderTrailing,
  wrapRow,
  rowAccessibilityLabel,
  rowAccessibilityHint,
  avatars = true,
  handles = "duplicates",
  searchThreshold = PICKER_SEARCH_THRESHOLD,
  inlineLimit = PICKER_INLINE_LIMIT,
  searchPlaceholder = "Search",
  onShowAll,
  initialQuery = "",
  autoFocusSearch = false,
  header,
  footer,
  refreshControl,
  contentContainerStyle,
  style,
  testID,
}: Props<T>) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [query, setQuery] = useState(initialQuery);
  // Inline without onShowAll and without search (a handful of people): "Show
  // all" opens the rest in place.
  const [expanded, setExpanded] = useState(false);
  const searchRef = useRef<TextInputInstance>(null);

  const hasSearch = pickerHasSearch(people.length, searchThreshold);
  const matches = useMemo(() => (hasSearch ? filterPeople(people, query) : [...people]), [people, query, hasSearch]);
  const needsHandle = useMemo(() => idsNeedingHandle(people), [people]);
  const trimmedQuery = query.trim();

  const renderRow = (person: T, last: boolean) => {
    const label = personLabel(person);
    const row = (
      <PersonRow
        person={person}
        showHandle={handles === "always" || needsHandle.has(person.id)}
        avatar={avatars ? (mode === "list" ? 40 : 32) : false}
        compact={mode === "inline"}
        trailing={renderTrailing?.(person)}
        chevron={!!onPick && !renderTrailing}
        onPress={onPick && (canPick?.(person) ?? true) ? () => onPick(person) : undefined}
        onLongPress={onLongPress ? () => onLongPress(person) : undefined}
        accessibilityLabel={rowAccessibilityLabel?.(person) ?? label}
        accessibilityHint={rowAccessibilityHint}
        last={last}
      />
    );
    return wrapRow ? wrapRow(person, row) : row;
  };

  const search = hasSearch ? (
    <TextField
      ref={searchRef}
      icon="search"
      placeholder={searchPlaceholder}
      accessibilityLabel={searchPlaceholder}
      value={query}
      onChangeText={setQuery}
      autoFocus={autoFocusSearch}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
      containerStyle={mode === "inline" ? styles.searchInline : styles.searchList}
      clearable
    />
  ) : null;

  const noMatch = (
    <Text style={styles.stateText} accessibilityLiveRegion="polite">
      No one called &ldquo;{trimmedQuery}&rdquo;
    </Text>
  );

  // ── Loading, error, nobody ────────────────────────────────────────────
  let status: ReactNode = null;
  if (loading && people.length === 0) {
    status = (
      <View style={styles.state} accessibilityLabel="Loading">
        <ActivityIndicator color={theme.colors.textSecondary} />
      </View>
    );
  } else if (error && people.length === 0) {
    status = (
      <View style={styles.state} accessibilityRole="alert">
        <Text style={styles.stateText}>{error}</Text>
        {onRetry ? (
          <Button label="Try again" variant="text" size="pill" onPress={onRetry} style={styles.retry} />
        ) : null}
      </View>
    );
  } else if (people.length === 0 && mode === "inline") {
    status = emptyState ?? null;
  }

  if (mode === "list") {
    return (
      <View style={[styles.list, style]} testID={testID}>
        {header}
        {status ?? (
          <>
            {search}
            <FlatList
              data={matches}
              keyExtractor={(p) => p.id}
              renderItem={({ item, index }) => renderRow(item, index === matches.length - 1)}
              // Nobody yet sits inside the list, so pull-to-refresh still works.
              ListEmptyComponent={
                people.length === 0 ? (
                  emptyState ? <>{emptyState}</> : undefined
                ) : trimmedQuery ? (
                  <View style={styles.state}>{noMatch}</View>
                ) : undefined
              }
              ListFooterComponent={footer ? <>{footer}</> : undefined}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              refreshControl={refreshControl}
              contentContainerStyle={contentContainerStyle}
              style={styles.flatList}
              initialNumToRender={12}
              windowSize={7}
            />
          </>
        )}
      </View>
    );
  }

  // ── Inline ────────────────────────────────────────────────────────────
  if (status) return <View style={style} testID={testID}>{status}</View>;

  const showEverything = expanded && !onShowAll;
  const visible = showEverything ? matches : matches.slice(0, inlineLimit);
  const hidden = matches.length - visible.length;

  const handleShowAll = () => {
    if (onShowAll) onShowAll(query);
    else if (hasSearch) searchRef.current?.focus();
    else setExpanded(true);
  };

  return (
    <View style={style} testID={testID}>
      {search}
      {visible.length === 0 && trimmedQuery ? (
        <View style={styles.state}>{noMatch}</View>
      ) : (
        visible.map((person, i) => (
          <Fragment key={person.id}>{renderRow(person, hidden === 0 && i === visible.length - 1)}</Fragment>
        ))
      )}
      {hidden > 0 ? (
        <ListRow
          label={trimmedQuery ? `Show all ${matches.length} matches` : `Show all ${matches.length}`}
          accessory="chevron"
          onPress={handleShowAll}
          accessibilityLabel={trimmedQuery ? `Show all ${matches.length} matches` : `Show all ${matches.length} people`}
          last
          style={styles.inlineRow}
        />
      ) : null}
    </View>
  );
}

interface PersonRowProps {
  person: PickerPerson;
  /** Show @handle under the name (when they have both). */
  showHandle?: boolean;
  /** Avatar size, or false for none (free-text names). */
  avatar?: 32 | 40 | false;
  /** Tighter rows inside a sheet. */
  compact?: boolean;
  trailing?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  last?: boolean;
}

/**
 * One person as a row: Avatar, name, @handle when it's needed to tell two
 * people apart. PersonPicker draws every row with it; anything else that
 * lists a person (e.g. a friend suggestion under "Who was there") should too.
 */
export function PersonRow({
  person,
  showHandle = false,
  avatar = 32,
  compact = false,
  trailing,
  chevron = false,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  last = false,
}: PersonRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const label = personLabel(person);
  const handle = showHandle && !!person.username && !!person.displayName?.trim() ? `@${person.username}` : undefined;
  return (
    <ListRow
      label={label}
      subtitle={handle}
      subtitleLines={1}
      detail={person.detail}
      leading={avatar ? <Avatar path={person.avatarPath} name={label} size={avatar} /> : undefined}
      trailing={trailing}
      accessory={chevron ? "chevron" : "none"}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      last={last}
      style={compact ? styles.inlineRow : undefined}
    />
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    list: {
      flexShrink: 1,
    },
    flatList: {
      flexShrink: 1,
    },
    inlineRow: {
      minHeight: 0,
      paddingVertical: theme.spacing.sm,
    },
    searchInline: {
      minHeight: 40,
      marginVertical: theme.spacing.xs,
    },
    searchList: {
      marginBottom: theme.spacing.sm,
    },
    state: {
      paddingVertical: theme.spacing.md,
    },
    stateText: {
      ...theme.typography.body,
      fontSize: theme.fontSize.callout,
      color: theme.colors.textSecondary,
    },
    retry: {
      alignSelf: "flex-start",
      marginTop: theme.spacing.xs,
    },
  });
}
