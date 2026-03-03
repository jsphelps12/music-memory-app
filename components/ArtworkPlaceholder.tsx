import { StyleProp, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/hooks/useTheme";
import { gradients } from "@/constants/theme";

interface Props {
  style?: StyleProp<ViewStyle>;
}

export function ArtworkPlaceholder({ style }: Props) {
  const theme = useTheme();
  return (
    <LinearGradient
      colors={theme.isDark ? gradients.brandDark : gradients.brand}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={style}
    />
  );
}
