import { useRouter, type Href } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { ListRow } from "@/components/ListRow";
import type { IconName } from "@/components/Icon";

/**
 * Long-press on the capture button (1.4, Josh's idea): places to start a
 * moment from. A tap on + still opens capture as always; this is the quick
 * pick for when you know where you want to begin.
 */
export function CaptureMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const posthog = usePostHog();

  const go = (choice: string, href: Href) => {
    posthog?.capture("capture_menu_choice", { choice });
    onClose();
    router.push(href);
  };

  const rows: { key: string; label: string; subtitle: string; icon: IconName; href: Href }[] = [
    {
      key: "identify",
      label: "Identify",
      subtitle: "Listen for what's playing nearby",
      icon: "pulse",
      href: { pathname: "/create", params: { identify: "1", source: "capture_menu" } },
    },
    {
      key: "search",
      label: "Search",
      subtitle: "Find a song by name or artist",
      icon: "search",
      href: { pathname: "/create", params: { search: "1", source: "capture_menu" } },
    },
    {
      key: "last_week",
      label: "Last week",
      subtitle: "Songs and photos from the week just ended",
      icon: "calendar-outline",
      href: "/last-week",
    },
    {
      key: "from_before",
      label: "From before",
      subtitle: "Old songs from your library, with their photos",
      icon: "time-outline",
      href: "/from-before",
    },
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Start from">
      {rows.map((row, i) => (
        <ListRow
          key={row.key}
          label={row.label}
          subtitle={row.subtitle}
          icon={row.icon}
          last={i === rows.length - 1}
          onPress={() => go(row.key, row.href)}
        />
      ))}
    </BottomSheet>
  );
}
