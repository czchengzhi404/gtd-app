import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { useTheme } from "../hooks/useTheme";
import { radius, spacing } from "../tokens";

export interface SearchBarProps {
  placeholder?: string;
  onChangeText: (text: string) => void;
}

export function SearchBar({ placeholder = "搜索任务", onChangeText }: SearchBarProps) {
  const colors = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.surface,
          borderColor: focused ? colors.primary : colors.border,
        },
      ]}
    >
      <TextInput
        accessibilityLabel={placeholder}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, { color: colors.text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
  },
  input: {
    fontSize: 16,
    lineHeight: 24,
    padding: 0,
  },
});
