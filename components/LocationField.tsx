import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { searchPlaces, GeoResult } from "@/lib/geocoding";
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
  const [focusedField, setFocusedField] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (!text.trim()) {
      setLocationResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setLocationSearching(true);
      try {
        const results = await searchPlaces(text);
        setLocationResults(results);
      } catch {
        setLocationResults([]);
      } finally {
        setLocationSearching(false);
      }
    }, 400);
  };

  const selectLocation = (result: GeoResult) => {
    Haptics.selectionAsync();
    onChange(result);
    setLocationQuery("");
    setLocationResults([]);
  };

  const clearLocation = () => {
    onChange(null);
    setLocationQuery("");
    setLocationResults([]);
  };

  return (
    <>
      {/* GPS suggestion banner */}
      {suggestion && !dismissedSuggestion && !value && (
        <View style={styles.suggestionBanner}>
          <View style={styles.suggestionRow}>
            <Text style={styles.suggestionLabel} numberOfLines={1}>
              Currently in {suggestion}
            </Text>
            <TouchableOpacity
              onPress={() => setDismissedSuggestion(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.suggestionDismissText}>✕</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.suggestionUseButton}
            activeOpacity={0.7}
            onPress={() => {
              onChange({
                name: suggestion,
                lat: suggestionCoords?.lat ?? null,
                lng: suggestionCoords?.lng ?? null,
              });
              setDismissedSuggestion(true);
              Haptics.selectionAsync();
            }}
          >
            <Text style={styles.suggestionUseText}>Use as location</Text>
          </TouchableOpacity>
        </View>
      )}

      {value ? (
        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <Ionicons name="location-outline" size={14} color={theme.colors.accentText} />
            <Text style={styles.chipText} numberOfLines={1}>{value.name}</Text>
          </View>
          <TouchableOpacity onPress={clearLocation} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.colors.placeholder} />
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <TextInput
            style={[styles.input, focusedField && { borderColor: theme.colors.accent }]}
            placeholder="Search for a place..."
            placeholderTextColor={theme.colors.placeholder}
            cursorColor={theme.colors.accent}
            value={locationQuery}
            onChangeText={handleQueryChange}
            onFocus={() => setFocusedField(true)}
            onBlur={() => setFocusedField(false)}
            autoCorrect={false}
            autoCapitalize="words"
            returnKeyType="search"
          />
          {locationSearching && (
            <ActivityIndicator size="small" color={theme.colors.accent} style={{ marginTop: 8 }} />
          )}
          {locationResults.length > 0 && (
            <View style={[styles.resultsList, { backgroundColor: theme.colors.backgroundSecondary, borderColor: theme.colors.border }]}>
              {locationResults.map((result, i) => (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.resultItem,
                    i < locationResults.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
                  ]}
                  onPress={() => selectLocation(result)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="location-outline" size={14} color={theme.colors.textSecondary} style={{ marginRight: 8 }} />
                  <Text style={[styles.resultText, { color: theme.colors.text }]} numberOfLines={1}>
                    {result.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}
    </>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    suggestionBanner: {
      backgroundColor: theme.colors.backgroundSecondary,
      borderRadius: theme.radii.md,
      padding: theme.spacing.md,
      marginTop: theme.spacing.xl,
      marginBottom: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    suggestionRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: theme.spacing.sm,
    },
    suggestionLabel: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.text,
      fontWeight: theme.fontWeight.medium,
      flex: 1,
    },
    suggestionDismissText: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
    },
    suggestionUseButton: {
      backgroundColor: theme.colors.buttonBg,
      borderRadius: theme.radii.sm,
      paddingVertical: theme.spacing.sm,
      alignItems: "center",
    },
    suggestionUseText: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.buttonText,
    },
    chipRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
      flex: 1,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 8,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.accentBg,
    },
    chipText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accentText,
      fontWeight: theme.fontWeight.medium,
      flex: 1,
    },
    input: {
      height: 52,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingHorizontal: theme.spacing.lg,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      backgroundColor: theme.colors.backgroundInput,
    },
    resultsList: {
      marginTop: theme.spacing.xs,
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: "hidden",
    },
    resultItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 12,
    },
    resultText: {
      fontSize: theme.fontSize.sm,
      flex: 1,
    },
  });
}
