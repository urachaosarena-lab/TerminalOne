with open('src/services/HeroService.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

lines.insert(37, "\nconst ENEMIES = ['🧝', '🧞', '🧛', '🧜', '🧟', '🐦‍⬛', '🕷️', '🦟', '🦇', '🦖'];\n")

with open('src/services/HeroService.js', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('Added ENEMIES definition')
