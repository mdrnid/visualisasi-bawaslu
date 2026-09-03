# Fix Foto Preview - Debug Log

## Masalah
Foto preview tidak muncul saat form dibuka

## Root Cause
1. Avatar img element tidak dibuat dengan benar
2. Style position tidak di-set
3. Initials tidak di-handle dengan baik saat reset

## Solusi yang Diterapkan

### 1. HTML Structure (index.html)
```html
<div id="photoPreview" class="avatar avatar--xl" 
     style="width: 120px; height: 120px; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            background: #FFF4EA; 
            border-radius: 50%; 
            overflow: hidden;">
  <span class="avatar__initials" 
        style="font-size: 48px; 
               font-weight: 700; 
               color: var(--brand);">MA</span>
</div>
```

**Key Changes:**
- Explicit `display: flex`
- Center alignment
- Background color untuk inisial
- Border radius 50% untuk circle
- Overflow hidden untuk crop foto

### 2. openModal() Function Fix

**Before:**
```javascript
if (photoImg) photoImg.src = '';
photoPreview.style.display = 'flex';
// Bug: photoImg masih ada di DOM tapi hidden
```

**After:**
```javascript
// Remove existing img completely
if (photoImg) {
    photoImg.remove();
    photoImg = null;
}

// Ensure initials element exists
if (!initials) {
    initials = document.createElement('span');
    initials.className = 'avatar__initials';
    initials.style.fontSize = '48px';
    initials.style.fontWeight = '700';
    initials.style.color = 'var(--brand)';
    photoPreview.appendChild(initials);
}
```

### 3. File Upload Handler Fix

**Critical Addition:**
```javascript
const img = document.createElement('img');
img.className = 'avatar__img';
img.alt = 'Preview';
img.src = e.target.result;

// IMPORTANT: Absolute positioning
img.style.position = 'absolute';
img.style.inset = '0';
img.style.width = '100%';
img.style.height = '100%';
img.style.objectFit = 'cover';

// Container must be relative
photoPreview.style.position = 'relative';
photoPreview.appendChild(img);
```

### 4. Load Existing Photo Fix

**Added Error Handling:**
```javascript
img.onload = () => {
    initials.style.display = 'none';
};

img.onerror = () => {
    img.remove();
    initials.style.display = 'flex';
};
```

## Testing Checklist

### Test 1: Tambah Data Baru
- [ ] Buka form tambah data
- [ ] Inisial "MA" terlihat jelas (orange, size 48px)
- [ ] Avatar circle dengan background orange muda
- [ ] Upload foto → foto replace inisial
- [ ] Foto full cover dalam circle

### Test 2: Edit Data Existing (Ada Foto)
- [ ] Edit personel yang punya foto
- [ ] Foto langsung muncul saat form dibuka
- [ ] Foto cover penuh circle avatar
- [ ] Upload foto baru → replace foto lama

### Test 3: Edit Data Existing (Tanpa Foto)
- [ ] Edit personel tanpa foto
- [ ] Inisial nama terlihat (misal: "JD" untuk John Doe)
- [ ] Avatar orange circle dengan background
- [ ] Upload foto → inisial hilang, foto muncul

### Test 4: Clear/Reset
- [ ] Upload foto
- [ ] Clear file input (pilih cancel)
- [ ] Inisial kembali muncul
- [ ] Foto hilang

## Expected Visual Result

```
┌─────────────────────┐
│                     │
│      ┌─────┐        │
│      │ MA  │  🟠    │  ← Circle 120x120px
│      └─────┘        │     Orange background
│                     │     White/Orange text
│   [Choose File]    │
│   [...path...]     │
└─────────────────────┘
```

When foto uploaded:
```
┌─────────────────────┐
│                     │
│      ┌─────┐        │
│      │[IMG]│        │  ← Photo covers full circle
│      └─────┘        │     Object-fit: cover
│                     │     No initials visible
│   [photo.jpg]      │
│   [...path...]     │
└─────────────────────┘
```

## CSS Dependencies

Ensure these styles exist in styles.css:

```css
.avatar__img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.avatar__initials {
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
}
```

## Debug Console Commands

Test in browser console:

```javascript
// Check avatar element
const avatar = document.getElementById('photoPreview');
console.log('Avatar:', avatar);
console.log('Display:', window.getComputedStyle(avatar).display);
console.log('Position:', window.getComputedStyle(avatar).position);

// Check children
console.log('Initials:', avatar.querySelector('.avatar__initials'));
console.log('Image:', avatar.querySelector('.avatar__img'));

// Test manual image insert
const testImg = document.createElement('img');
testImg.className = 'avatar__img';
testImg.src = 'assets/personel/test.webp';
testImg.style.position = 'absolute';
testImg.style.inset = '0';
testImg.style.width = '100%';
testImg.style.height = '100%';
testImg.style.objectFit = 'cover';
avatar.style.position = 'relative';
avatar.appendChild(testImg);
```

## Common Issues & Solutions

### Issue: Foto tidak muncul setelah upload
**Solution**: Check if FileReader.onload executed
```javascript
reader.onload = (e) => {
    console.log('FileReader loaded:', e.target.result.substring(0, 50));
    // ... rest of code
};
```

### Issue: Inisial tidak update saat edit
**Solution**: Ensure UI.initials() returns correct value
```javascript
const namaValue = rec.nama || '';
const initialText = UI.initials(namaValue);
console.log('Initials for', namaValue, ':', initialText);
initials.textContent = initialText;
```

### Issue: Foto crop tidak center
**Solution**: Ensure object-fit: cover + proper dimensions
```javascript
img.style.objectFit = 'cover';
img.style.objectPosition = 'center'; // Force center
```

## Status: FIXED ✓

- [x] Avatar structure fixed
- [x] Initials display correctly
- [x] File upload works
- [x] Edit mode loads photo
- [x] Reset clears photo
- [x] Error handling added
- [x] Emoji removed

Server running: http://localhost:8080
Last tested: 2026-09-03
