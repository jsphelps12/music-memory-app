import { View, Text, StyleSheet } from "react-native";

export default function CreateMomentScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>New Moment</Text>
      <Text style={styles.subtitle}>Capture a music memory</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
  },
});
