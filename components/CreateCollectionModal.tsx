import { useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { createCollection } from "@/lib/collections";
import { Collection } from "@/types";
import { friendlyError } from "@/lib/errors";

type CollectionType = "personal" | "shared";

interface Props {
  visible: boolean;
  userId: string;
  onCreated: (collection: Collection) => void;
  onClose: () => void;
}

export function CreateCollectionModal({ visible, userId, onCreated, onClose }: Props) {
  const theme = useTheme();
  const [name, setName] = useState("");
  const [type, setType] = useState<CollectionType>("personal");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<TextInput>(null);

  const reset = () => {
    setName("");
    setType("personal");
    setError("");
    setSaving(false);
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError("");
    try {
      const collection = await createCollection(userId, trimmed, type === "shared");
      reset();
      onCreated(collection);
    } catch (e: any) {
      setError(friendlyError(e));
      setSaving(false);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onShow={() => setTimeout(() => inputRef.current?.focus(), 50)}
      onRequestClose={handleClose}
    >
      <View style={[styles.flex, styles.overlay]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <Pressable style={styles.flex} onPress={handleClose} />
          <View style={[styles.card, { backgroundColor: theme.colors.cardBg }]}>
            <Text style={[styles.title, { color: theme.colors.text }]}>New Collection</Text>

            {/* Type selector */}
            <View style={[styles.typeRow, { backgroundColor: theme.colors.backgroundInput }]}>
              <TouchableOpacity
                style={[
                  styles.typeOption,
                  type === "personal" && { backgroundColor: theme.colors.cardBg },
                ]}
                onPress={() => setType("personal")}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={15}
                  color={type === "personal" ? theme.colors.text : theme.colors.textSecondary}
                />
                <Text
                  style={[
                    styles.typeLabel,
                    { color: type === "personal" ? theme.colors.text : theme.colors.textSecondary },
                  ]}
                >
                  Personal
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeOption,
                  type === "shared" && { backgroundColor: theme.colors.cardBg },
                ]}
                onPress={() => setType("shared")}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="people-outline"
                  size={15}
                  color={type === "shared" ? theme.colors.accent : theme.colors.textSecondary}
                />
                <Text
                  style={[
                    styles.typeLabel,
                    { color: type === "shared" ? theme.colors.accent : theme.colors.textSecondary },
                  ]}
                >
                  Shared
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.typeHint, { color: theme.colors.textSecondary }]}>
              {type === "personal"
                ? "Just for you — private and not shareable."
                : "Invite others to join and add their moments."}
            </Text>

            <TextInput
              ref={inputRef}
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.backgroundInput,
                  color: theme.colors.text,
                },
              ]}
              placeholder="Summer 2024, Road trip..."
              placeholderTextColor={theme.colors.placeholder}
              cursorColor={theme.colors.accent}
              value={name}
              onChangeText={setName}
              returnKeyType="done"
              onSubmitEditing={handleCreate}
              maxLength={60}
            />
            {error ? (
              <Text style={[styles.errorText, { color: theme.colors.destructive }]}>{error}</Text>
            ) : null}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: theme.colors.chipBg }]}
                onPress={handleClose}
                activeOpacity={0.7}
              >
                <Text style={[styles.btnText, { color: theme.colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.btn,
                  {
                    backgroundColor: theme.colors.buttonBg,
                    opacity: !name.trim() || saving ? 0.5 : 1,
                  },
                ]}
                onPress={handleCreate}
                disabled={!name.trim() || saving}
                activeOpacity={0.7}
              >
                <Text style={[styles.btnText, { color: theme.colors.buttonText }]}>
                  {saving ? "Creating..." : "Create"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: {
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  card: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 44,
    gap: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
  },
  typeRow: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 3,
  },
  typeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  typeLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  typeHint: {
    fontSize: 12,
    marginTop: -4,
  },
  input: {
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  errorText: {
    fontSize: 13,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
