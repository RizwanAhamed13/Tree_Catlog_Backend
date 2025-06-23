const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cloudinary = require('cloudinary').v2;
const cors = require('cors');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Upload tree
app.post('/trees', async (req, res) => {
  const { name, species, description, image, css_style, student_id } = req.body;
  try {
    const { data: existing } = await supabase
      .from('trees')
      .select('id')
      .eq('name', name)
      .eq('species', species)
      .eq('student_id', student_id);
    console.log('Existing trees:', existing);

    if (existing.length > 0) {
      const { data, error } = await supabase
        .from('duplicates')
        .insert([{ tree_id: existing[0].id, name, species, description, image_url: image, css_style, student_id }]);
      if (error) throw error;
      console.log('Duplicate inserted:', data);
      return res.status(201).json(data || []);
    }

    const { data, error } = await supabase
      .from('trees')
      .insert([{ name, species, description, image_url: image, css_style, student_id }]);
    if (error) throw error;
    console.log('Tree inserted:', data);
    res.status(201).json(data || []);
  } catch (error) {
    console.error('Error adding tree:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all trees
app.get('/trees', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('trees')
      .select('*, ratings(*)');
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete all trees
app.delete('/trees', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  try {
    const { error } = await supabase.from('trees').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
    await supabase.from('duplicates').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('ratings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting all trees:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a specific tree
app.delete('/trees/:id', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  const { id } = req.params;
  if (!id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    return res.status(400).json({ error: 'Invalid tree ID format' });
  }
  try {
    const { data: tree, error: treeError } = await supabase.from('trees').select('id').eq('id', id).single();
    if (treeError) throw treeError;
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    await supabase.from('ratings').delete().eq('tree_id', id);
    await supabase.from('duplicates').delete().eq('tree_id', id);
    const { error: deleteError } = await supabase.from('trees').delete().eq('id', id);
    if (deleteError) throw deleteError;

    console.log(`Deleted tree with ID: ${id}`);
    res.status(204).send();
  } catch (error) {
    console.error(`Error deleting tree ${id}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Rate tree
app.post('/ratings', async (req, res) => {
  const { tree_id, student_id, rating } = req.body;
  try {
    const { data, error } = await supabase
      .from('ratings')
      .insert([{ tree_id, student_id, rating }]);
    if (error) throw error;
    res.status(201).json(data || []);
  } catch (error) {
    console.error('Error adding rating:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single tree
app.get('/trees/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('trees')
      .select('*, ratings(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Tree not found' });
    res.json(data);
  } catch (error) {
    console.error('Error fetching tree:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload image to Cloudinary
app.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    const result = await cloudinary.uploader.upload(req.file.path, {
      upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET,
    });
    res.json({ url: result.secure_url });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(process.env.PORT, () => console.log(`Server running on port ${process.env.PORT}`));