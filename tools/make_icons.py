"""Генерация иконок: тёмно-синий квадрат, белые фотоаппарат и балка. Запуск: python tools/make_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(exist_ok=True)
BG = (16, 44, 92, 255)
FG = (255, 255, 255, 255)
S = 1024


def draw(scale: float) -> Image.Image:
    """scale — доля холста, занятая пиктограммой (для maskable меньше)."""
    img = Image.new("RGBA", (S, S), BG)
    d = ImageDraw.Draw(img)
    k = S * scale / 100.0
    ox = oy = (S - 100 * k) / 2

    def P(x, y):
        return (ox + x * k, oy + y * k)

    # камера
    d.rounded_rectangle([*P(10, 28), *P(90, 74)], radius=8 * k, fill=FG)
    d.rounded_rectangle([*P(32, 18), *P(52, 32)], radius=4 * k, fill=FG)
    d.ellipse([*P(31, 31), *P(69, 69)], fill=BG)
    d.ellipse([*P(36, 36), *P(64, 64)], fill=FG)
    d.ellipse([*P(43, 43), *P(57, 57)], fill=BG)
    d.ellipse([*P(76, 35), *P(84, 43)], fill=BG)
    # двутавровая балка под камерой
    d.rectangle([*P(18, 82), *P(82, 86)], fill=FG)
    d.rectangle([*P(18, 94), *P(82, 98)], fill=FG)
    d.rectangle([*P(47, 86), *P(53, 94)], fill=FG)
    return img


def save(img: Image.Image, name: str, size: int) -> None:
    img.resize((size, size), Image.LANCZOS).convert("RGB" if name.startswith("apple") else "RGBA").save(OUT / name)


main = draw(0.88)
save(main, "icon-192.png", 192)
save(main, "icon-512.png", 512)
save(main, "apple-touch-icon.png", 180)
save(draw(0.62), "maskable-512.png", 512)
print("icons ->", OUT)

