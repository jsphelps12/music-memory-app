import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { Collection } from "@/types";

interface Props {
  visible: boolean;
  collections: Collection[];
  selectedId: string | null;
  onSelect: (collection: Collection | null) => void;
  onClose: () => void;
  onRequestCreate: () => void;
}

export function CollectionPicker({
  visible,
  collections,
  selectedId,
  onSelect,
  onClose,
  onRequestCreate,
}: Props) {
  const theme = useTheme();

  const owned = collections.filter((c) => c.role === "owner");
  const shared = collections.filter((c) => c.role === "member");

  const handleSelect = (collection: Collection | null) => {
    onSelect(collection);
    onClose();
  };

  const renderRow = (item: Collection) => (
    <TouchableOpacity
      key={item.id}
      style={styles.row}
      onPress={() => handleSelect(item)}
      activeOpacity={0.7}
    >
      <View style={styles.rowLeft}>
        <Ionicons
          name={item.role === "member" ? "people-outline" : "folder-outline"}
          size={20}
          color={theme.colors.textSecondary}
          style={styles.rowIcon}
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowName, { color: theme.colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          {item.role === "member" && item.ownerName ? (
            <Text style={[styles.rowSub, { color: theme.colors.textTertiary }]}>
              by {item.ownerName}
            </Text>
          ) : item.momentCount !== undefined ? (
            <Text style={[styles.rowSub, { color: theme.colors.textTertiary }]}>
              {item.momentCount} {item.momentCount === 1 ? "moment" : "moments"}
            </Text>
          ) : null}
        </View>
      </View>
      {selectedId === item.id ? (
        <Ionicons name="checkmark" size={20} color={theme.colors.accent} />
      ) : null}
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={[
          styles.backdrop,
          { backgroundColor: theme.isDark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.3)" },
        ]}
        onPress={onClose}
      />
      <View style={[styles.sheet, { backgroundColor: theme.colors.cardBg }]}>
        <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
        <Text style={[styles.sheetTitle, { color: theme.colors.textSecondary }]}>
          Collections
        </Text>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* All Moments */}
          <TouchableOpacity style={styles.row} onPress={() => handleSelect(null)} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <Ionicons
                name="albums-outline"
                size={20}
                color={theme.colors.textSecondary}
                style={styles.rowIcon}
              />
              <Text style={[styles.rowName, { color: theme.colors.text }]}>All Moments</Text>
            </View>
            {selectedId === null ? (
              <Ionicons name="checkmark" size={20} color={theme.colors.accent} />
            ) : null}
          </TouchableOpacity>

          {/* My Collections */}
          {owned.length > 0 ? (
            <>
              <View style={[styles.sectionDivider, { borderTopColor: theme.colors.border }]}>
                <Text style={[styles.sectionLabel, { color: theme.colors.textTertiary }]}>
                  MY COLLECTIONS
                </Text>
              </View>
              {owned.map(renderRow)}
            </>
          ) : null}

          {/* Shared With Me */}
          {shared.length > 0 ? (
            <>
              <View style={[styles.sectionDivider, { borderTopColor: theme.colors.border }]}>
                <Text style={[styles.sectionLabel, { color: theme.colors.textTertiary }]}>
                  SHARED WITH ME
                </Text>
              </View>
              {shared.map(renderRow)}
            </>
          ) : null}

          {/* New Collection */}
          <View style={[styles.sectionDivider, { borderTopColor: theme.colors.border }]} />
          <TouchableOpacity style={styles.row} onPress={onRequestCreate} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <Ionicons
                name="add-circle-outline"
                size={20}
                color={theme.colors.accent}
                style={styles.rowIcon}
              />
              <Text style={[styles.rowName, { color: theme.colors.accent }]}>
                New Collection
              </Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 20,
    maxHeight: "70%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  scroll: {
    flexGrow: 0,
  },
  sectionDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  rowIcon: {
    marginRight: 12,
  },
  rowName: {
    fontSize: 16,
    fontWeight: "500",
  },
  rowSub: {
    fontSize: 12,
    marginTop: 1,
  },
});
