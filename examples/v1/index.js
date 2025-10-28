const RapidfyJS = require('../../src/core/ApplicationFactory');
const path = require('path');
const fs = require('fs');

const app = RapidfyJS();

const router = RapidfyJS.Router({ prefix: '/api/v1' });

app.use(RapidfyJS.cors({
    origin: ['http://example.com', 'http://anotherdomain.com'],
    allowedHeaders: 'Authorization,User-Agent,Accept',
    preflightContinue: false, // Change to true to pass OPTIONS requests to next handlers
}));
app.use(RapidfyJS.json());
app.use(RapidfyJS.urlencoded());
app.use(RapidfyJS.xml());
app.use(RapidfyJS.formData({
    uploadDir: path.resolve(__dirname, 'uploads'),
    maxFileSize: 10 * 1024 * 1024, // จำกัดไฟล์ใหญ่
    maxFiles: 5,                   // จำกัด 5 ไฟล์ต่อ Request
    fieldSize: 10 * 1024,          // จำกัด Text Field ไม่เกิน 10KB
    fields: 20                     // จำกัดจำนวน Field ไม่เกิน 20
}));

app.get('/', (req, res) => {
    res.json({ message: 'Hello, World!' });
});

app.post('/data', (req, res) => {
    const validationResult = req.validate(['body', 'params'], {
        'name': 'required|string|max:255',
        'email': 'required|email', 
        'password': 'required|string|min:8',
        'dob': 'required|date_format:YYYY-MM-DD'
    });

    if (validationResult.error) {
        return res.status(400).json({ 
            status: 'failed', 
            errors: validationResult.errors // Errors จะถูกจัดโครงสร้างตาม source
        });
    }
    res.json({ received: true, data: req.body });
});

app.post('/upload', (req, res) => {
    // req.body มี Text Fields
    const title = req.body.title; 
    
    // req.files มีข้อมูลไฟล์
    const uploadedFile = req.files.imageFile; // 'imageFile' คือชื่อ input ในฟอร์ม
    
    if (uploadedFile) {
        // 💡 หลังการประมวลผลเสร็จสิ้น อย่าลืมลบไฟล์ชั่วคราว!
        // fs.unlink(uploadedFile.tempFilePath, (err) => {
        //     if (err) console.error("Error deleting temp file:", err);
        // });
        
        res.json({ 
            status: 'File uploaded and processed', 
            fileName: uploadedFile.filename,
            size: uploadedFile.size,
            title: title
        });
    } else {
        res.status(400).json({ error: 'File is required' });
    }
});

app.get('/redirect', (req, res) => {
    // Redirect ไปยังหน้าหลักด้วยสถานะ 301 (Moved Permanently)
    res.redirect('https://www.npmjs.com/package/validatorjs', 301); 
});

router.get('/profile', (req, res) => {
  res.status(200).json({ user: 'Kimmy', role: 'admin' });
});
app.use(router);

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});