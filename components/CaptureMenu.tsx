import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { ListRow } from "@/components/ListRow";
import type { IconName } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import {
  continueDraftSubtitle,
  draftMeta,
  draftTitle,
  type CaptureDraft,
} from "@/lib/captureDraft";
import { getProvider } from "@/lib/providers";
import { searchItunes } from "@/lib/itunes";
import {
  resolveSuggestionSong,
  suggestionSong,
  yourDayCaptureParams,
  yourDayEventProps,
  type CatalogSearch,
} from "@/lib/yourDay";
import { isYourDayAvailable, pickYourDay } from "@/modules/journaling-suggestions";

/**
 * Your day's song is matched in the Apple Music catalog, then the no-auth
 * iTunes search when Apple Music can't answer (not authorized, no
 * subscription), like the share extension's songs.
 */
const YOUR_DAY_SEARCHES: CatalogSearch[] = [
  (query) => getProvider("apple_music").search(query),
  (query) => searchItunes(query, 10),
];

/** Your day's row: Apple's picker up, the song being matched, or it failed to open. */
type YourDayState = "idle" | "picking" | "matching" | "failed";

const draftHref = (draft: CaptureDraft): Href => ({
  pathname: "/create",
  params: { draftId: draft.id, source: "capture_menu" },
});

/**
 * Long-press on the capture button (1.4, Josh's idea): places to start a
 * moment from. A tap on + still opens capture as always; this is the quick
 * pick for when you know where you want to begin.
 *
 * With drafts waiting (`drafts`: live, not open in another capture, newest
 * first, read by TabBar before it opens this), "Continue a draft" comes
 * first. One draft opens straight away; several open a second quick pick
 * listing them, once this sheet has gone (DESIGN.md: hand off on onClosed).
 */
export function CaptureMenu({
  visible,
  onClose,
  drafts,
}: {
  visible: boolean;
  onClose: () => void;
  drafts: readonly CaptureDraft[];
}) {
  const router = useRouter();
  const posthog = usePostHog();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [listOpen, setListOpen] = useState(false);
  // Several drafts: list them once this sheet has gone.
  const [listAfterClose, setListAfterClose] = useState(false);
  // Your day (Apple, 1.5): only where Apple's picker can run (an iPhone on
  // iOS 17.2+ with the 1.5 binary; never the simulator).
  const [yourDayAvailable] = useState(isYourDayAvailable);
  const [yourDay, setYourDay] = useState<YourDayState>("idle");
  // Bumped when the sheet closes, so a match that finishes after the person
  // dismissed the sheet doesn't open capture anyway.
  const yourDayRun = useRef(0);
  useEffect(() => {
    if (visible) return;
    yourDayRun.current += 1;
    setYourDay("idle");
  }, [visible]);

  const go = (choice: string, href: Href) => {
    posthog?.capture("capture_menu_choice", { choice });
    onClose();
    router.push(href);
  };

  // Apple's picker opens over this sheet; closing it leaves the sheet up. A
  // pick fills capture with its song (matched to the catalog), photos, place,
  // people and date (lib/yourDay.ts). Nothing is saved until Save.
  const startYourDay = async () => {
    if (yourDay === "picking" || yourDay === "matching") return;
    posthog?.capture("capture_menu_choice", { choice: "your_day" });
    const run = ++yourDayRun.current;
    setYourDay("picking");
    const result = await pickYourDay();
    if (run !== yourDayRun.current) return;
    if (result.status === "cancelled") {
      setYourDay("idle");
      return;
    }
    if (result.status === "failed") {
      posthog?.capture("your_day_failed");
      setYourDay("failed");
      return;
    }
    setYourDay("matching");
    const want = suggestionSong(result.suggestion);
    const match = want ? await resolveSuggestionSong(want, YOUR_DAY_SEARCHES) : null;
    if (run !== yourDayRun.current) return;
    // Counts and flags only: no titles, names or places leave the phone.
    posthog?.capture("your_day_picked", yourDayEventProps(result.suggestion, match));
    onClose();
    router.push({ pathname: "/create", params: yourDayCaptureParams(result.suggestion, match) });
  };

  const yourDaySubtitle =
    yourDay === "matching"
      ? "Finding the song…"
      : yourDay === "failed"
        ? "Apple's suggestions didn't open. Try again."
        : "Songs, photos and places Apple suggests from your day";

  const continueDraft = () => {
    if (drafts.length === 1) {
      go("continue_draft", draftHref(drafts[0]));
      return;
    }
    posthog?.capture("capture_menu_choice", { choice: "continue_draft", drafts: drafts.length });
    setListAfterClose(true);
    onClose();
  };

  const rows: {
    key: string;
    label: string;
    subtitle: string;
    icon: IconName;
    onPress: () => void;
    busy?: boolean;
  }[] = [
    ...(drafts.length > 0
      ? [
          {
            key: "continue_draft",
            label: "Continue a draft",
            subtitle: continueDraftSubtitle(drafts),
            icon: "pencil-outline" as const,
            onPress: continueDraft,
          },
        ]
      : []),
    {
      key: "identify",
      label: "Identify",
      subtitle: "Listen for what's playing nearby",
      icon: "pulse",
      onPress: () => go("identify", { pathname: "/create", params: { identify: "1", source: "capture_menu" } }),
    },
    {
      key: "search",
      label: "Search",
      subtitle: "Find a song by name or artist",
      icon: "search",
      onPress: () => go("search", { pathname: "/create", params: { search: "1", source: "capture_menu" } }),
    },
    {
      key: "last_week",
      label: "Last week",
      subtitle: "Songs and photos from the week just ended",
      icon: "calendar-outline",
      onPress: () => go("last_week", "/last-week"),
    },
    ...(yourDayAvailable
      ? [
          {
            key: "your_day",
            label: "Your day (Apple)",
            subtitle: yourDaySubtitle,
            icon: "journal-outline" as const,
            onPress: () => void startYourDay(),
            busy: yourDay === "picking" || yourDay === "matching",
          },
        ]
      : []),
    {
      key: "from_before",
      label: "From before",
      subtitle: "Old songs from your library, with their photos",
      icon: "time-outline",
      onPress: () => go("from_before", "/from-before"),
    },
  ];

  const now = Date.now();

  return (
    <>
      <BottomSheet
        visible={visible}
        onClose={onClose}
        onClosed={() => {
          if (!listAfterClose) return;
          setListAfterClose(false);
          setListOpen(true);
        }}
        title="Start from"
      >
        {/* Inset like every other sheet's rows, so the icons clear the edge. */}
        <View style={styles.body}>
          {rows.map((row, i) => (
            <ListRow
              key={row.key}
              testID={`capture-menu-${row.key.replace(/_/g, "-")}`}
              label={row.label}
              subtitle={row.subtitle}
              icon={row.icon}
              last={i === rows.length - 1}
              onPress={row.onPress}
              disabled={row.busy}
              trailing={row.busy ? <ActivityIndicator size="small" color={theme.colors.textSecondary} /> : undefined}
            />
          ))}
        </View>
      </BottomSheet>

      {/* Up to MAX_DRAFTS rows, so it scrolls past the sheet's height. */}
      <BottomSheet visible={listOpen} onClose={() => setListOpen(false)} title="Drafts" testID="capture-drafts-sheet">
        <ScrollView contentContainerStyle={styles.body}>
          {drafts.map((draft, i) => (
            <ListRow
              key={draft.id}
              testID={`capture-draft-${i}`}
              label={draftTitle(draft)}
              subtitle={draftMeta(draft, now)}
              subtitleLines={1}
              last={i === drafts.length - 1}
              onPress={() => {
                posthog?.capture("capture_menu_draft_opened", { index: i, drafts: drafts.length });
                setListOpen(false);
                router.push(draftHref(draft));
              }}
            />
          ))}
        </ScrollView>
      </BottomSheet>
    </>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    body: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.sm,
    },
  });
}
