---
name: ItemName split into 4 columns
description: ItemName is split into Collection, Name, Measurement, Info/Material in UI; concatenated with spaces in backend
type: feature
---
The UI displays 4 columns: Collection, Name (ItemName), Measurement, Info/Material.
In the backend/export, they are joined with a single space via `getClothName(row)`, skipping empty fields to avoid double spaces.
The ClothRow interface has fields: Collection, ItemName, Measurement, InfoMaterial.
