import { useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { CloseButton } from "@/components/CloseButton";
import { friendlyError } from "@/lib/errors";
import { createCollection } from "@/lib/collections";

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
}

export function NewSharedCollectionModal({ visible, onClose, userId }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    setName("");
    onClose();
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const collection = await createCollection(userId, trimmed, true);
      await queryClient.invalidateQueries({ queryKey: ["sharedScreen", userId] });
      handleClose();
      router.push({ pathname: "/collection/[id]" as any, params: { id: collection.id } });
    } catch (e: any) {
      Alert.alert("Error", friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />
        <View style={[styles.sheet, { backgroundColor: theme.colors.background }]}>
          <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.text }]}>New Shared Collection</Text>
            <CloseButton onPress={handleClose} />
          </View>
          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Name</Text>
          <View style={[styles.inputRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.backgroundInput }]}>
            <TextInput
              style={[styles.input, { color: theme.colors.text }]}
              placeholder="e.g. Road Trip Mix"
              placeholderTextColor={theme.colors.placeholder}
              value={name}
              onChangeText={setName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
          </View>
          <TouchableOpacity
            style={[
              styles.createBtn,
              { backgroundColor: name.trim() ? theme.colors.accent : theme.colors.border },
            ]}
            onPress={handleCreate}
            disabled={!name.trim() || loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.createBtnText}>Create</Text>
            )}
          </TouchableOpacity>
          <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>
            You'll be taken to the collection to invite members.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: Platform.OS === "ios" ? 34 : 20,
    },
    handle: {
      width: 36, height: 4, borderRadius: 2,
      alignSelf: "center", marginTop: 12, marginBottom: 4, opacity: 0.4,
    },
    header: {
      flexDirection: "row", alignItems: "center",
      justifyContent: "space-between", paddingVertical: 12, marginBottom: 4,
    },
    title: { fontSize: 17, fontFamily: theme.fonts.bodySemibold },
    label: { fontSize: theme.fontSize.sm, fontFamily: theme.fonts.bodyMedium, marginBottom: 6 },
    inputRow: {
      borderRadius: theme.radii.sm, borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 14, height: 48, justifyContent: "center", marginBottom: 16,
    },
    input: { fontSize: theme.fontSize.base, fontFamily: theme.fonts.body },
    createBtn: {
      height: 50, borderRadius: theme.radii.button,
      alignItems: "center", justifyContent: "center", marginBottom: 12,
    },
    createBtnText: { color: "#fff", fontSize: theme.fontSize.base, fontFamily: theme.fonts.bodySemibold },
    hint: { fontSize: theme.fontSize.xs, textAlign: "center" },
  });
}
