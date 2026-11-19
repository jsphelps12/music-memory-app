import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { useFocusEffect } from "expo-router";
import { useReducedMotion } from "react-native-reanimated";
import { AppImage } from "@/components/AppImage";

/** How long each photo holds before the next fades in. */
export const HOLD_MS = 4500;
const FADE_MS = 900;
/** After a touch, wait this long before moving on again. */
const RESUME_MS = 6000;

/**
 * The moment's photo hero, slowly fading through its photos (Josh, 1.4).
 * It holds still with Reduce Motion, while the screen isn't in front or the
 * app is in the background, and for a few seconds after a touch. Tapping
 * opens the viewer at the photo showing.
 */
export function HeroPhotoCycle({
  urls,
  onOpen,
  counterStyle,
  counterTextStyle,
}: {
  urls: string[];
  onOpen: (index: number) => void;
  counterStyle: object;
  counterTextStyle: object;
}) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [focused, setFocused] = useState(true);
  const [active, setActive] = useState(AppState.currentState === "active");
  const pausedUntil = useRef(0);
  const cycles = urls.length > 1 && !reduceMotion && focused && active;

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setActive(s === "active"));
    return () => sub.remove();
  }, []);

  // Have the next photo ready before it fades in.
  useEffect(() => {
    if (urls.length > 1) void Image.prefetch(urls[(index + 1) % urls.length]);
  }, [index, urls]);

  useEffect(() => {
    if (!cycles) return;
    const timer = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      setIndex((i) => (i + 1) % urls.length);
    }, HOLD_MS);
    return () => clearInterval(timer);
  }, [cycles, urls.length]);

  // The moment's photos changed (an edit): start over.
  useEffect(() => {
    setIndex(0);
  }, [urls]);

  const shown = urls[Math.min(index, urls.length - 1)];

  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPressIn={() => {
        pausedUntil.current = Date.now() + RESUME_MS;
      }}
      onPress={() => onOpen(index)}
      style={StyleSheet.absoluteFill}
      accessibilityRole="imagebutton"
      accessibilityLabel={`Photo ${index + 1} of ${urls.length}. Open photos`}
    >
      <AppImage
        source={{ uri: shown }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={{ duration: reduceMotion ? 0 : FADE_MS, effect: "cross-dissolve" }}
      />
      {urls.length > 1 ? (
        <View style={counterStyle} pointerEvents="none">
          <Text style={counterTextStyle}>
            {index + 1} / {urls.length}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}
