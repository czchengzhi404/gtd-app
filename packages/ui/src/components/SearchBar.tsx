import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "../hooks/useTheme";
import { radius, space } from "../theme/tokens";

export interface SearchBarProps {
  placeholder?: string;
  onChangeText: (text: string) => void;
}

/** 搜索框：固定 44 高，聚焦时描边高亮 */
export function SearchBar({ placeholder = "搜索", onChangeText }: SearchBarProps) {
  const colors = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.surfaceMuted,
          borderColor: focused ? colors.primary : "transparent",
        },
      ]}
    >
      <Ionicons name="search" size={16} color={colors.textTertiary} />
      <TextInput
        accessibilityLabel={placeholder}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        allowFontScaling={false}
        maxFontSizeMultiplier={1}
        style={[styles.input, { color: colors.text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: space.lg,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    height: 42,
    padding: 0,
  },
});
