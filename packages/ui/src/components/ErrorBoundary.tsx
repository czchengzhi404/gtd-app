import { Component, type ErrorInfo, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { AppText } from "../theme/AppText";
import { Button } from "../theme/primitives";
import { radius, space } from "../theme/tokens";

/**
 * 渲染期错误边界。
 *
 * 为什么必须有：React Native 生产包里，渲染期未捕获异常会走
 * `ErrorUtils` 的全局 handler → Android 上直接杀掉进程（表现为"闪退"，
 * 用户看不到任何信息，开发者也拿不到堆栈）。
 *
 * 有了边界之后：错误被截住，界面显示错误摘要 + 重试按钮，
 * 应用不会整个退出；用户能截图把真实原因反馈回来。
 *
 * 注意：它只能接住**渲染/生命周期**里的同步错误，接不住
 * 原生层崩溃、事件回调里的异步错误（后者用全局 handler 记录）。
 */
export interface ErrorBoundaryProps {
  children: ReactNode;
  /** 错误变化时回调（用于落盘日志） */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
  info: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, info: "" };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ info: info.componentStack ?? "" });
    this.props.onError?.(error, info);
  }

  private reset = (): void => {
    this.setState({ error: null, info: "" });
  };

  render(): ReactNode {
    const { error, info } = this.state;
    if (error === null) return this.props.children;

    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <AppText variant="title" lines={2}>
            界面出错了
          </AppText>
          <AppText variant="body" tone="secondary" lines={4}>
            这不是数据丢失——你的任务和正文都还在本地库里。可以先点「重试」回到界面。
          </AppText>

          <View style={styles.card}>
            <AppText variant="label" weight="semibold" lines={4}>
              {error.message || String(error)}
            </AppText>
          </View>

          {info.length > 0 ? (
            <View style={styles.card}>
              <AppText variant="caption" tone="tertiary" lines={24}>
                {info.slice(0, 2000)}
              </AppText>
            </View>
          ) : null}

          <Button label="重试" variant="primary" onPress={this.reset} />
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  content: {
    padding: space.lg,
    gap: space.md,
  },
  card: {
    padding: space.md,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
});
