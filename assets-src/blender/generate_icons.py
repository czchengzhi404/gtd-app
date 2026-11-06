"""用 Blender 生成应用图标素材（GTD 清单）。

设计：3D 立体风格——两叠圆角卡片（清单/稿件）+ 一个对勾（完成）。
全部用几何体拼装（不用曲线），保证形状可控、边缘干净。

用法：
  blender -b --factory-startup -P generate_icons.py -- --variant icon
  ... --variant foreground | background | monochrome | splash
"""
import bpy
import math
import os
import sys
from mathutils import Vector

argv = sys.argv
args = argv[argv.index("--") + 1 :] if "--" in argv else []
variant = "icon"
for i, a in enumerate(args):
    if a == "--variant" and i + 1 < len(args):
        variant = args[i + 1]

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, "apps", "mobile", "assets", "images")
os.makedirs(OUT_DIR, exist_ok=True)

BRAND_TOP = (0.24, 0.66, 1.0, 1.0)
BRAND_BOTTOM = (0.04, 0.32, 0.86, 1.0)
PAPER = (0.98, 0.985, 0.995, 1.0)
PAPER_BACK = (0.80, 0.87, 0.98, 1.0)
CHECK = (0.03, 0.26, 0.82, 1.0)

CONFIG = {
    "icon": dict(res=1024, transparent=False, scale=1.0, name="icon.png", ortho=1.85),
    "foreground": dict(res=1024, transparent=True, scale=0.80, name="android-icon-foreground.png", ortho=1.85),
    "background": dict(res=1024, transparent=False, scale=1.0, name="android-icon-background.png", ortho=1.85),
    "monochrome": dict(res=1024, transparent=True, scale=0.80, name="android-icon-monochrome.png", ortho=1.85),
    "splash": dict(res=1024, transparent=True, scale=0.95, name="splash-icon.png", ortho=1.85),
}


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def look_at(obj, target):
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def make_material(name, color, roughness=0.35, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def make_flat_white(name):
    """纯白自发光材质：用于 monochrome 剪影层（不需要灯光，输出恒为纯白）"""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    em = nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    em.inputs["Strength"].default_value = 1.0
    mat.node_tree.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return mat


def rounded_box(name, size, radius, location, material, rotation=(0.0, 0.0, 0.0)):
    """圆角长方体：立方体 + Bevel 修改器"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0], size[1], size[2])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    bevel = obj.modifiers.new("bevel", "BEVEL")
    bevel.width = radius
    bevel.segments = 10
    bevel.limit_method = "ANGLE"
    bevel.harden_normals = True

    obj.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    return obj


def stroke(name, p1, p2, width, thickness, z, material, extend=0.06):
    """两点之间的一条圆角"笔画"（用于拼对勾）"""
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    length = math.hypot(dx, dy) + extend
    angle = math.atan2(dy, dx)
    mid = ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)
    return rounded_box(
        name,
        (length, width, thickness),
        width * 0.5,
        (mid[0], mid[1], z),
        material,
        (0.0, 0.0, angle),
    )


def make_check(material, scale=1.0, z=0.16):
    """对勾：短笔画 + 长笔画，接头重叠避免缝隙。
    坐标以对勾自身的视觉重心为原点（先画再整体偏移），保证居中。"""
    a = (-0.34 * scale, 0.10 * scale)
    b = (-0.08 * scale, -0.22 * scale)
    c = (0.38 * scale, 0.30 * scale)
    w = 0.088 * scale
    # 视觉重心：x 取两端中点，y 取折点与顶部的中点
    cx = (a[0] + c[0]) / 2
    cy = (b[1] + (a[1] + c[1]) / 2) / 2
    offset = (-cx, -cy)
    a = (a[0] + offset[0], a[1] + offset[1])
    b = (b[0] + offset[0], b[1] + offset[1])
    c = (c[0] + offset[0], c[1] + offset[1])
    stroke("check-short", a, b, w, 0.10 * scale, z, material)
    stroke("check-long", b, c, w, 0.10 * scale, z, material)


def setup_world(top, bottom):
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    bg = nodes["Background"]

    texcoord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    grad = nodes.new("ShaderNodeTexGradient")
    ramp = nodes.new("ShaderNodeValToRGB")

    mapping.inputs["Rotation"].default_value = (math.radians(-90), 0, 0)
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = bottom
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = top

    links.new(texcoord.outputs["Window"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], grad.inputs["Vector"])
    links.new(grad.outputs["Color"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 1.0
    bpy.context.scene.world = world


def setup_lights():
    specs = [
        ("Key", (2.6, -3.0, 3.6), 380, 3.2),
        ("Fill", (-3.4, -2.0, 2.2), 140, 5.0),
        ("Rim", (0.5, 3.6, 3.0), 220, 3.0),
    ]
    for name, loc, energy, size in specs:
        data = bpy.data.lights.new(name, type="AREA")
        data.energy = energy
        data.size = size
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = loc
        look_at(obj, Vector((0.0, 0.0, 0.0)))


def setup_camera(ortho):
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ortho
    cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (0.0, -2.4, 2.8)
    look_at(cam, Vector((0.0, 0.0, 0.0)))
    bpy.context.scene.camera = cam


def setup_render(res, transparent):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 128
    scene.cycles.use_denoising = True
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"


def build(variant_name):
    clear_scene()
    cfg = CONFIG[variant_name]
    transparent = cfg["transparent"]
    # 几何体固定基准尺寸；"占比"由相机视野控制（ortho / scale）
    s = 1.0

    if variant_name == "monochrome":
        ink = make_flat_white("Ink")
        # 只保留对勾：单色图层的任务是"一个可辨识的符号"，
        # 卡片与对勾同为纯白时会糊成一团，主题图标反而看不清。
        make_check(ink, 1.15 * s, 0.06 * s)
    elif variant_name == "background":
        # 纯背景层：只铺渐变，不放任何几何体
        setup_world(BRAND_TOP, BRAND_BOTTOM)
    else:
        paper = make_material("Paper", PAPER, roughness=0.40)
        paper_back = make_material("PaperBack", PAPER_BACK, roughness=0.50)
        check_mat = make_material("CheckInk", CHECK, roughness=0.46)

        # 后层卡片：错位 + 反向微旋，制造"一叠纸"的层次
        rounded_box("card-back", (0.88 * s, 1.04 * s, 0.10 * s), 0.10 * s,
                    (0.07 * s, 0.05 * s, -0.05 * s), paper_back, (0.0, 0.0, math.radians(-8)))
        # 前层卡片
        rounded_box("card-front", (0.88 * s, 1.04 * s, 0.10 * s), 0.10 * s,
                    (0.0, 0.0, 0.02 * s), paper, (0.0, 0.0, math.radians(-8)))
        # 对勾
        make_check(check_mat, 0.74 * s, 0.10 * s)

        setup_world(BRAND_TOP, BRAND_BOTTOM)
        setup_lights()

    setup_camera(cfg["ortho"] / cfg["scale"])
    setup_render(cfg["res"], transparent)

    out_path = os.path.join(OUT_DIR, cfg["name"])
    bpy.context.scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)
    print("WROTE", out_path, os.path.getsize(out_path))


build(variant)
