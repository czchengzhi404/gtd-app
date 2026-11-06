# 图标素材：用 Blender 生成

应用图标、Android 自适应图标三层、启动图、favicon 全部由 Blender 脚本渲染生成，**不依赖任何在线生成器或付费素材**。

## 为什么用 3D 渲染

- 立体卡片 + 柔和光影，比扁平图标更有质感，也和「写作者的工具」这个定位相符；
- 全部参数化：改颜色/角度/厚度改脚本里几个数字即可，不用重画；
- 输出可控：想要多大尺寸就渲多大，不用放大插值。

## 文件

```
assets-src/blender/
  generate_icons.py   # 主脚本：五个变体
  preview.py          # 把三层合成一张预览图（模拟桌面效果）
  make_favicon.py     # 从主图标派生 favicon
  smoke_test.py       # 冒烟测试：确认本机 Blender 能无头渲染
  preview-icon.png    # 预览图（不是应用资源）
```

生成的资源（`apps/mobile/assets/images/`）：

| 文件 | 用途 | 说明 |
|---|---|---|
| `icon.png` | 应用图标 / iOS | 1024×1024，含背景 |
| `android-icon-background.png` | Android 自适应图标 · 背景层 | **纯渐变**，不含任何元素 |
| `android-icon-foreground.png` | Android 自适应图标 · 前景层 | 透明底，元素控制在安全区内 |
| `android-icon-monochrome.png` | Android 13 主题图标 | 透明底纯剪影（只有对勾） |
| `splash-icon.png` | 启动图 | 透明底 |
| `favicon.png` | 网页 | 64×64 |

## 重新生成

```bash
BLENDER="E:\Steam\steamapps\common\Blender\blender.exe"

# 单独生成某一层
"$BLENDER" -b --factory-startup -P assets-src/blender/generate_icons.py -- --variant icon
"$BLENDER" -b --factory-startup -P assets-src/blender/generate_icons.py -- --variant foreground
"$BLENDER" -b --factory-startup -P assets-src/blender/generate_icons.py -- --variant background
"$BLENDER" -b --factory-startup -P assets-src/blender/generate_icons.py -- --variant monochrome
"$BLENDER" -b --factory-startup -P assets-src/blender/generate_icons.py -- --variant splash

# 预览 + favicon
python assets-src/blender/preview.py
python assets-src/blender/make_favicon.py
```

单个变体约 40–60 秒（Cycles CPU，128 samples，1024×1024）。

## 参数在哪改

`generate_icons.py` 顶部：

| 变量 | 作用 |
|---|---|
| `BRAND_TOP` / `BRAND_BOTTOM` | 背景渐变（上浅下深） |
| `PAPER` / `PAPER_BACK` | 卡片颜色（前层 / 后层） |
| `CHECK` | 对勾颜色 |
| `CONFIG[...]["scale"]` | 该变体里元素占画面的比例（越大元素越大） |
| `CONFIG[...]["ortho"]` | 正交相机视野 |

## 设计约束（改的时候别踩）

1. **自适应图标的背景层必须是纯背景**。如果背景层也画了卡片，最终图标会出现两层重影——因为系统会把前景层叠上来。
2. **前景层元素要留在中心 66% 内**。启动器的圆角/圆形遮罩会裁掉边缘。当前 `scale=0.80` 是这个约束下的合适值。
3. **单色层只放一个符号**。卡片和对勾同为纯白时会糊成一团，主题图标就看不出形状了。
4. **对勾不能超出卡片边缘**。超出部分会被卡片挡住，露在外面的圆头会变成两个蓝色小耳朵。当前 `make_check(..., 0.74)` 是这个约束下的值。
5. **色调映射用 Standard，不要用 AgX**。AgX 会把品牌蓝压成灰蓝，且过曝时对勾会从蓝变青。

## 已知取舍

- 渲染用的是 **Cycles CPU**（无头环境没有 GPU 上下文），128 samples + 降噪，单张约 1 分钟。要更快可降到 64 samples。
- 图形语言是「两张卡片 + 对勾」。两张卡片的错位在圆角遮罩下不太看得出来，实际效果接近单张卡片——这是可接受的简化。
