from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SHEET = ROOT / "source" / "run-cycle-generated.png"
FRAMES = ROOT / "assets" / "player" / "frames"
PREVIEWS = ROOT / "assets" / "player" / "previews"
ATLASES = ROOT / "assets" / "player" / "atlases"
SIZE = 256


def remove_green(image):
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            green_score = g - max(r, b)
            if g > 120 and green_score > 42:
                pixels[x, y] = (r, g, b, 0)
            elif g > 95 and green_score > 22:
                alpha = max(0, min(a, int((42 - green_score) / 20 * 255)))
                pixels[x, y] = (r, g, b, alpha)
    return rgba


def content_bbox(image):
    alpha = image.getchannel("A")
    return alpha.point(lambda p: 255 if p > 16 else 0).getbbox()


def keep_largest_component(image):
    alpha = image.getchannel("A")
    mask = alpha.load()
    width, height = image.size
    seen = set()
    largest = []

    for y in range(height):
        for x in range(width):
            if (x, y) in seen or mask[x, y] <= 16:
                continue

            stack = [(x, y)]
            seen.add((x, y))
            component = []
            while stack:
                px, py = stack.pop()
                component.append((px, py))
                for nx, ny in ((px + 1, py), (px - 1, py), (px, py + 1), (px, py - 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    if (nx, ny) in seen or mask[nx, ny] <= 16:
                        continue
                    seen.add((nx, ny))
                    stack.append((nx, ny))

            if len(component) > len(largest):
                largest = component

    kept = Image.new("RGBA", image.size, (0, 0, 0, 0))
    kept_pixels = kept.load()
    source_pixels = image.load()
    for x, y in largest:
        kept_pixels[x, y] = source_pixels[x, y]
    return kept


def normalize_cell(cell, target_bbox):
    cropped = cell.crop(target_bbox)
    scale = min(220 / cropped.width, 188 / cropped.height)
    resized = cropped.resize(
        (round(cropped.width * scale), round(cropped.height * scale)),
        Image.Resampling.LANCZOS,
    )
    frame = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    x = round((SIZE - resized.width) / 2)
    y = round(34 + (188 - resized.height) / 2)
    frame.alpha_composite(resized, (x, y))
    return frame


def split_sheet():
    source = remove_green(Image.open(SHEET))
    cell_w = source.width // 8
    cells = [
        keep_largest_component(source.crop((i * cell_w, 0, (i + 1) * cell_w, source.height)))
        for i in range(8)
    ]
    boxes = [content_bbox(cell) for cell in cells]
    left = min(box[0] for box in boxes)
    top = min(box[1] for box in boxes)
    right = max(box[2] for box in boxes)
    bottom = max(box[3] for box in boxes)
    target_bbox = (left, top, right, bottom)
    return [normalize_cell(cell, target_bbox) for cell in cells]


def checker(size=SIZE, cell=16):
    bg = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    draw = ImageDraw.Draw(bg)
    for y in range(0, size, cell):
        for x in range(0, size, cell):
            color = (230, 221, 212, 255) if (x // cell + y // cell) % 2 else (250, 244, 238, 255)
            draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill=color)
    return bg


def save_gif(frames, path, checkerboard=False):
    bg = checker() if checkerboard else None
    gif_frames = []
    for frame in frames:
        composed = Image.new("RGBA", frame.size, (255, 255, 255, 0))
        if bg:
            composed.alpha_composite(bg)
        composed.alpha_composite(frame)
        gif_frames.append(composed.convert("P", palette=Image.Palette.ADAPTIVE))
    gif_frames[0].save(path, save_all=True, append_images=gif_frames[1:], duration=70, loop=0, disposal=2)


def rebuild_atlas(run_frames):
    atlas_path = ATLASES / "player-actions-a.png"
    old = Image.open(atlas_path).convert("RGBA")
    atlas = Image.new("RGBA", (SIZE * 8, SIZE * 4), (0, 0, 0, 0))
    atlas.alpha_composite(old.crop((0, 0, SIZE * 4, SIZE * 4)), (0, 0))
    for index, frame in enumerate(run_frames):
        atlas.alpha_composite(frame, (index * SIZE, SIZE))
    atlas.save(atlas_path)


def main():
    frames = split_sheet()
    for index, frame in enumerate(frames):
        frame.save(FRAMES / f"run_{index:02d}.png")
    save_gif(frames, PREVIEWS / "run.gif")
    save_gif(frames, PREVIEWS / "run-checker.gif", checkerboard=True)
    rebuild_atlas(frames)


if __name__ == "__main__":
    main()
