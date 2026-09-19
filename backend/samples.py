SHOPPING = [
    ('Everyday backpack', 2800, 82), ('Wireless headphones', 3500, 90),
    ('Mechanical keyboard', 2200, 78), ('Everyday sneakers', 4200, 88),
    ('Fitness smartwatch', 3800, 85), ('Insulated water bottle', 800, 55),
    ('LED desk lamp', 1400, 65), ('The reading collection', 1200, 72),
]
INVESTMENT = [
    ('Atlas index fund', 4000, 12.5), ('Cedar green energy', 2500, 16),
    ('Meridian technology', 3500, 18), ('Harbor bond fund', 2000, 7.5),
    ('Orion healthcare', 3000, 14), ('Maple consumer fund', 1500, 9),
    ('Summit infrastructure', 4500, 17), ('Willow small-cap fund', 2200, 15.5),
]
SAMPLES = [
    {'mode': mode, 'budget': '10000', 'items': [
        {'id': f'{mode}-{i + 1}', 'name': name, 'cost': str(cost), 'score': str(score)}
        for i, (name, cost, score) in enumerate(rows)]}
    for mode, rows in [('shopping', SHOPPING), ('investment', INVESTMENT)]
]