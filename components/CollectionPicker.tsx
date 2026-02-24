import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
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

  const handleSelect = (collection: Collection | null) => {
    onSelect(collection);
    onClose();
  };

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
          {
            backgroundColor: theme.isDark
              ? "rgba(0,0,0,0.6)"
              : "rgba(0,0,0,0.3)",
          },
        ]}
        onPress={onClose}
      />
      <View style={[styles.sheet, { backgroundColor: theme.colors.cardBg }]}>
        <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
        <Text style={[styles.sheetTitle, { color: theme.colors.textSecondary }]}>
          Collections
        </Text>

        {/* All Moments row */}
        <TouchableOpacity
          style={styles.row}
          onPress={() => handleSelect(null)}
          activeOpacity={0.7}
        >
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

        {collections.length > 0 ? (
          <>
            <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
            <FlatList
              data={collections}
              keyExtractor={(item) => item.id}
              style={styles.list}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.rowLeft}>
                    <Ionicons
                      name="folder-outline"
                      size={20}
                      color={theme.colors.textSecondary}
                      style={styles.rowIcon}
                    />
                    <View>
                      <Text style={[styles.rowName, { color: theme.colors.text }]}>
                        {item.name}
                      </Text>
                      {item.momentCount !== undefined ? (
                        <Text style={[styles.rowCount, { color: theme.colors.textTertiary }]}>
                          {item.momentCount} {item.momentCount === 1 ? "moment" : "moments"}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {selectedId === item.id ? (
                    <Ionicons name="checkmark" size={20} color={theme.colors.accent} />
                  ) : null}
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => (
                <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
              )}
            />
          </>
        ) : null}

        <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

        {/* New Collection row */}
        <TouchableOpacity
          style={styles.row}
          onPress={onRequestCreate}
          activeOpacity={0.7}
        >
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
  list: {
    flexGrow: 0,
    maxHeight: 320,
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
  rowCount: {
    fontSize: 12,
    marginTop: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 20,
  },
});
