import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { searchPlaces, GeoResult } from "@/lib/geocoding";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { IconButton } from "@/components/IconButton";
import { TextField } from "@/components/TextField";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

interface LocationFieldProps {
  value: GeoResult | null;
  onChange: (result: GeoResult | null) => void;
  /** If true, detects current GPS location and shows a suggestion banner */
  detectCurrentLocation?: boolean;
}

export function LocationField({ value, onChange, detectCurrentLocation = false }: LocationFieldProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<GeoResult[]>([]);
  const [locationSearching, setLocationSearching] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const [suggestionCoords, setSuggestionCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [dismissedSuggestion, setDismissedSuggestion] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped on every keystroke, select and clear: a search whose id is no
  // longer current answers an old query and is dropped.
  const searchId = useRef(0);

  useEffect(
    () => () => {
      searchId.current += 1;
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    []
  );

  useEffect(() => {
    if (!detectCurrentLocation) return;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const [result] = await Location.reverseGeocodeAsync({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        if (!cancelled && result) {
          const s = [result.city, result.region].filter(Boolean).join(", ");
          if (s) {
            setSuggestion(s);
            setSuggestionCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          }
        }
      } catch {
        // Location unavailable — skip suggestion
      }
    })();
    return () => { cancelled = true; };
  }, [detectCurrentLocation]);

  const handleQueryChange = (text: string) => {
    setLocationQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const id = ++searchId.current;
    if (!text.trim()) {
      setLocationResults([]);
      setLocationSearching(false);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setLocationSearching(true);
      try {
        const results = await searchPlaces(text);
        if (id === searchId.current) setLocationResults(results);
      } catch {
        if (id === searchId.current) setLocationResults([]);
      } finally {
        if (id === searchId.current) setLocationSearching(false);
      }
    }, 400);
  };

  const cancelSearch = () => {
    searchId.current += 1;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setLocationSearching(false);
  };

  const selectLocation = (result: GeoResult) => {
    Haptics.selectionAsync();
    cancelSearch();
    onChange(result);
    setLocationQuery("");
    setLocationResults([]);
  };

  const clearLocation = () => {
    cancelSearch();
    onChange(null);
    setLocationQuery("");
    setLocationResults([]);
  };

  const applySuggestion = () => {
    onChange({
      name: suggestion,
      lat: suggestionCoords?.lat ?? null,
      lng: suggestionCoords?.lng ?? null,
    });
    setDismissedSuggestion(true);
    Haptics.selectionAsync();
  };

  if (value) {
    return (
      <View style={styles.chipRow}>
        <Chip
          label={value.name}
          variant="filled"
          icon="location-outline"
          onRemove={clearLocation}
          removeLabel="Clear place"
        />
      </View>
    );
  }

  return (
    <>
      {/* Where you are now, offered as one row above the search. */}
      {suggestion && !dismissedSuggestion ? (
        <View style={styles.suggestionRow}>
          <Ionicons name="navigate-outline" size={18} color={theme.colors.textSecondary} />
          <Text style={styles.suggestionText} numberOfLines={1}>
            Currently in {suggestion}
          </Text>
          <Button label="Use" size="pill" variant="secondary" onPress={applySuggestion} style={styles.inRow} />
          <IconButton
            name="close"
            size={18}
            color={theme.colors.textSecondary}
            onPress={() => setDismissedSuggestion(true)}
            accessibilityLabel="Dismiss"
            style={styles.dismiss}
          />
        </View>
      ) : null}

      <TextField
        icon="search"
        placeholder="Search for a place"
        accessibilityLabel="Search for a place"
        value={locationQuery}
        onChangeText={handleQueryChange}
        autoCorrect={false}
        autoCapitalize="words"
        returnKeyType="search"
        trailing={
          locationSearching ? <ActivityIndicator size="small" color={theme.colors.textSecondary} /> : null
        }
      />
      {locationResults.length > 0 && (
        <View style={styles.results}>
          {locationResults.map((result, i) => (
            <Pressable
              key={`${result.name}-${i}`}
              style={({ pressed }) => [styles.resultRow, pressed && styles.pressed]}
              onPress={() => selectLocation(result)}
              accessibilityRole="button"
            >
              <Ionicons name="location-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.resultText} numberOfLines={1}>
                {result.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    suggestionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      minHeight: 52,
      marginBottom: theme.spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    suggestionText: {
      ...theme.typography.body,
      color: theme.colors.text,
      flex: 1,
    },
    inRow: {
      alignSelf: "center",
    },
    dismiss: {
      marginLeft: -theme.spacing.sm,
      marginRight: -theme.spacing.md,
    },
    chipRow: {
      flexDirection: "row",
      marginBottom: theme.spacing.md,
    },
    // Rows ruled by hairlines, straight on the surface (DESIGN.md).
    results: {
      marginTop: theme.spacing.xs,
    },
    resultRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      minHeight: 48,
      paddingHorizontal: theme.spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    pressed: { opacity: 0.6 },
    resultText: {
      ...theme.typography.body,
      color: theme.colors.text,
      flex: 1,
    },
  });
}
