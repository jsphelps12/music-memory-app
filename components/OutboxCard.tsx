import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppImage } from "@/components/AppImage";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { artworkUrlAtSize } from "@/lib/itunes";
import { outboxCardStatus } from "@/lib/outboxUi";
import { persistableArtworkUrl } from "@/lib/momentRow";
import type { OutboxItem } from "@/lib/outbox";

const ARTWORK_PX = 168;

interface Props {
  item: OutboxItem;
  /** Rejected items only: try it again. */
  onRetry: (item: OutboxItem) => void;
  /** Rejected items only: asks, then takes it out. */
  onDiscard: (item: OutboxItem) => void;
}

/**
 * A moment waiting in the outbox (lib/outbox.ts), at the top of the Journal:
 * laid out like MomentCard but quieter (dimmed artwork, the writing in
 * secondary ink, no date, no menu, not tappable). Waiting on its own it says
 * "Saves when you're back online"; refused, it says why and offers Try again
 * and Discard.
 */
function OutboxCardComponent({ item, onRetry, onDiscard }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { song, reflection } = item.input;
  const status = outboxCardStatus(item);
  const writing = (reflection ?? "").trim();
  // A remote URL only, as the saved moment will have.
  const artwork = persistableArtworkUrl(song.artworkUrl);

  return (
    <View
      style={styles.row}
      testID="outbox-card"
      accessible={!status.rejected}
      accessibilityLabel={`${song.title} by ${song.artistName}. ${status.label}`}
    >
      <View style={styles.header}>
        {artwork ? (
          <AppImage source={{ uri: artworkUrlAtSize(artwork, ARTWORK_PX) }} style={styles.artwork} transition={200} />
        ) : (
          <ArtworkPlaceholder style={styles.artwork} />
        )}
        <View style={styles.titles}>
          <Text style={styles.songTitle} numberOfLines={1}>
            {song.title}
          </Text>
          {song.artistName ? (
            <Text style={styles.songArtist} numberOfLines={1}>
              {song.artistName}
            </Text>
          ) : null}
        </View>
      </View>

      {writing ? (
        <Text style={styles.reflection} numberOfLines={2}>
          {writing}
        </Text>
      ) : null}

      <View style={styles.metaRow}>
        <Icon
          name={status.rejected ? "alert-circle-outline" : "cloud-offline-outline"}
          size={14}
          color={theme.colors.textSecondary}
        />
        <Text style={styles.meta} numberOfLines={1}>
          {status.label}
        </Text>
      </View>
      {status.rejected && status.reason ? (
        <Text style={styles.reason} numberOfLines={2}>
          {status.reason}
        </Text>
      ) : null}

      {status.rejected ? (
        <View style={styles.actions}>
          <Button
            label="Try again"
            variant="text"
            size="pill"
            onPress={() => onRetry(item)}
            testID="outbox-retry"
          />
          <Button
            label="Discard"
            variant="text"
            size="pill"
            tone="destructive"
            onPress={() => onDiscard(item)}
            testID="outbox-discard"
          />
        </View>
      ) : null}
    </View>
  );
}

export const OutboxCard = memo(OutboxCardComponent);

function createStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      paddingVertical: theme.spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
    },
    // Dimmed: it isn't in the journal yet.
    artwork: {
      width: 56,
      height: 56,
      borderRadius: theme.radii.sm,
      opacity: 0.6,
    },
    titles: {
      flex: 1,
      marginLeft: theme.spacing.md + 2,
      marginRight: theme.spacing.sm,
    },
    songTitle: {
      ...theme.typography.bodyStrong,
      color: theme.colors.textSecondary,
    },
    songArtist: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      color: theme.colors.textTertiary,
      marginTop: 1,
    },
    reflection: {
      ...theme.typography.reading,
      marginTop: theme.spacing.md - 2,
      color: theme.colors.textSecondary,
    },
    metaRow: {
      marginTop: theme.spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
    },
    meta: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
      flexShrink: 1,
    },
    reason: {
      ...theme.typography.meta,
      marginTop: 2,
      color: theme.colors.textTertiary,
    },
    actions: {
      marginTop: theme.spacing.xs,
      flexDirection: "row",
      gap: theme.spacing.md,
    },
  });
}
