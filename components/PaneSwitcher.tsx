import { ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import PagerView from "react-native-pager-view";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

export interface Pane {
  key: string;
  label: string;
  /** An unread dot after the label (terracotta: it's a signal). */
  dot?: boolean;
  testID?: string;
}

interface Props {
  /** Exactly the panes to show, left to right ("Yours", "Shared"). */
  panes: readonly Pane[];
  /** One child per pane, in the same order. */
  children: readonly ReactNode[];
  /**
   * false: no labels and no swiping, only the first pane (a person with no
   * friends and nothing shared sees just their own things). Flipping it keeps
   * the first pane mounted, so the switch can appear once data loads without
   * resetting that pane.
   */
  showSwitch?: boolean;
  /**
   * false: a swipe no longer moves between panes (the labels still do), e.g.
   * while the Journal is selecting moments. Default true.
   */
  swipeEnabled?: boolean;
  /** Called when the visible pane changes (by swipe or by tapping a label). */
  onPaneChange?: (key: string) => void;
  /** Style for the label row, e.g. horizontal padding to line up with a header. */
  labelsStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}

/**
 * Yours / Shared inside a tab (Journal, Albums): text labels with an ink
 * underline under the active one, and a horizontal swipe between the panes.
 * Both panes stay mounted (CLAUDE.md, view toggling), so switching back keeps
 * each list's scroll position. Swiping moves between panes here, never
 * between tabs (the tab bar doesn't swipe).
 */
export function PaneSwitcher({
  panes,
  children,
  showSwitch = true,
  swipeEnabled = true,
  onPaneChange,
  labelsStyle,
  style,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const pagerRef = useRef<PagerView>(null);
  const [index, setIndex] = useState(0);

  const select = useCallback(
    (i: number) => {
      setIndex(i);
      pagerRef.current?.setPage(i);
      const key = panes[i]?.key;
      if (key) onPaneChange?.(key);
    },
    [panes, onPaneChange]
  );

  // Hidden, the pager holds only the first pane, so a switch shown again
  // starts there too.
  if (!showSwitch && index !== 0) setIndex(0);

  // One tree either way: hiding the switch drops the labels and the other
  // panes but keeps the PagerView, so the first pane isn't remounted when the
  // switch appears (that would lose its list's scroll position).
  const shownChildren = showSwitch ? children : children.slice(0, 1);

  return (
    <View style={[styles.fill, style]}>
      {showSwitch ? (
        <View style={[styles.labels, labelsStyle]} accessibilityRole="tablist">
          {panes.map((pane, i) => {
            const active = i === index;
            return (
              <Pressable
                key={pane.key}
                testID={pane.testID}
                onPress={() => select(i)}
                hitSlop={8}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={pane.dot ? `${pane.label}, new` : pane.label}
                style={styles.label}
              >
                <View style={styles.labelRow}>
                  <Text style={[styles.labelText, active && styles.labelTextActive]}>{pane.label}</Text>
                  {pane.dot ? <View style={styles.dot} /> : null}
                </View>
                <View style={[styles.underline, active && styles.underlineActive]} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <PagerView
        ref={pagerRef}
        style={styles.fill}
        initialPage={0}
        scrollEnabled={showSwitch && swipeEnabled}
        onPageSelected={(e) => {
          const i = e.nativeEvent.position;
          if (i === index) return;
          setIndex(i);
          const key = panes[i]?.key;
          if (key) onPaneChange?.(key);
        }}
      >
        {shownChildren.map((child, i) => (
          <View key={panes[i]?.key ?? i} style={styles.fill} collapsable={false}>
            {child}
          </View>
        ))}
      </PagerView>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    fill: {
      flex: 1,
    },
    labels: {
      flexDirection: "row",
      gap: theme.spacing.lg,
      paddingHorizontal: theme.spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    label: {
      paddingTop: theme.spacing.xs,
    },
    labelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingBottom: theme.spacing.sm,
    },
    labelText: {
      ...theme.typography.body,
      color: theme.colors.textSecondary,
    },
    labelTextActive: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.accent, // design-lint-ignore: the 8px new-activity dot on a pane label
    },
    underline: {
      height: 2,
      borderRadius: 1,
      backgroundColor: "transparent",
    },
    underlineActive: {
      backgroundColor: theme.colors.text,
    },
  });
}
