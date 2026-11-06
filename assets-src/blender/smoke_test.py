"""无头渲染冒烟测试：确认 Blender 能在无 GUI 的环境下用 Cycles CPU 出图。

用法：blender -b --factory-startup -P smoke_test.py
"""
import bpy
import sys
import os

OUT = os.path.join(os.environ.get("TEMP", "/tmp"), "blender-smoke.png")

# 清空默认场景
bpy.ops.wm.read_factory_settings(use_empty=True)

# 一个圆角感的球
bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=64, ring_count=32, location=(0, 0, 0))
sphere = bpy.context.object
bpy.ops.object.shade_smooth()

# 材质：蓝色玻璃质感
mat = bpy.data.materials.new("Blue")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.13, 0.54, 0.94, 1.0)
bsdf.inputs["Roughness"].default_value = 0.18
bsdf.inputs["Metallic"].default_value = 0.0
sphere.data.materials.append(mat)

# 相机（正交，正面）
cam_data = bpy.data.cameras.new("Cam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = 3.0
cam = bpy.data.objects.new("Cam", cam_data)
bpy.context.collection.objects.link(cam)
cam.location = (0, 0, 6)
bpy.context.scene.camera = cam

# 三点光
for name, loc, energy in [
    ("Key", (4, -4, 6), 800),
    ("Fill", (-5, -3, 3), 300),
    ("Rim", (0, 6, 4), 500),
]:
    light_data = bpy.data.lights.new(name, type="AREA")
    light_data.energy = energy
    light_data.size = 6
    light = bpy.data.objects.new(name, light_data)
    bpy.context.collection.objects.link(light)
    light.location = loc
    light.rotation_euler = (0.6, 0.0, 0.0) if name == "Key" else (0.0, 0.0, 0.0)

# 世界背景：浅灰
world = bpy.data.worlds.new("World")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.92, 0.96, 1.0)
world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
bpy.context.scene.world = world

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 32
scene.render.resolution_x = 256
scene.render.resolution_y = 256
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = OUT

bpy.ops.render.render(write_still=True)

print("RENDER_OK" if os.path.exists(OUT) else "RENDER_FAIL")
print("SIZE", os.path.getsize(OUT) if os.path.exists(OUT) else 0)
sys.stdout.flush()
