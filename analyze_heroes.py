import json

with open('data/heroes.json', 'r') as f:
    data = json.load(f)

print(f"Total heroes: {len(data)}")

# Check equipped items format
heroes_with_items = 0
old_format_count = 0
new_format_count = 0
removed_items_found = []

REMOVED_ITEMS = ['👷', '🦹', '🕵️', '🦴', '🦙']

for user_id, hero in data.items():
    has_equipped = any(hero['equipped'].values())
    if has_equipped:
        heroes_with_items += 1
        for item_type, equipped in hero['equipped'].items():
            if equipped:
                if isinstance(equipped, str):
                    old_format_count += 1
                    if equipped in REMOVED_ITEMS:
                        removed_items_found.append((user_id, item_type, equipped))
                    print(f"OLD FORMAT: User {user_id} has {item_type}={equipped}")
                elif isinstance(equipped, dict):
                    new_format_count += 1
                    if equipped.get('id') in REMOVED_ITEMS:
                        removed_items_found.append((user_id, item_type, equipped))

print(f"\nHeroes with equipped items: {heroes_with_items}")
print(f"Old format (string): {old_format_count}")
print(f"New format (dict): {new_format_count}")
print(f"Removed items still present: {len(removed_items_found)}")
if removed_items_found:
    for user_id, item_type, item in removed_items_found:
        print(f"  - User {user_id}: {item_type} = {item}")

# Check inventory
total_inventory_items = sum(len(h['inventory']) for h in data.values())
print(f"\nTotal inventory items across all heroes: {total_inventory_items}")

# Sample a few heroes
print("\n=== Sample Heroes ===")
for i, (user_id, hero) in enumerate(list(data.items())[:3]):
    print(f"\nUser {user_id}:")
    print(f"  Level: {hero['level']}, Energy: {hero['energy']}/{hero.get('maxEnergy', 3)}")
    print(f"  Equipped: {hero['equipped']}")
    print(f"  Inventory: {len(hero['inventory'])} items")
    if i >= 2:
        break
