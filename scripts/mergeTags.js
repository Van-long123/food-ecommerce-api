const fs = require('fs');

const f1 = JSON.parse(fs.readFileSync('d:/Ky8/Collections/official/fresh-food.products.json', 'utf8'));
const f2 = JSON.parse(fs.readFileSync('d:/Ky8/Collections/fresh-food.products2.json', 'utf8'));

console.log('f1 length:', f1.length);
console.log('f2 length:', f2.length);

let matchById = 0;
let matchBySlug = 0;

const f2MapById = new Map(f2.map(p => [p._id.$oid, p.tags]));
const f2MapBySlug = new Map(f2.map(p => [p.slug, p.tags]));

for (const p of f1) {
  if (f2MapById.has(p._id.$oid)) matchById++;
  if (f2MapBySlug.has(p.slug)) matchBySlug++;
}

console.log('Match by ID:', matchById);
console.log('Match by Slug:', matchBySlug);

// Update f1 based on f2
let updatedCount = 0;
for (const p of f1) {
  // Ưu tiên map theo ID trước, nếu không có thì map theo slug
  let newTags = f2MapById.get(p._id.$oid);
  if (!newTags) {
    newTags = f2MapBySlug.get(p.slug);
  }
  
  if (newTags) {
    p.tags = newTags;
    updatedCount++;
  }
}

console.log('Total products updated with tags:', updatedCount);

// Save back to f1
fs.writeFileSync('d:/Ky8/Collections/official/fresh-food.products.json', JSON.stringify(f1, null, 2), 'utf8');
console.log('Update completed!');
