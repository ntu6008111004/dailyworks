# 🗓️ Developer Daily Log (2026-05-22)

## 📌 สรุปการปรับปรุงระบบ (Performance & Optimization)

วันนี้ได้มีการปรับปรุงความเร็วและประสิทธิภาพของระบบลงบันทึกงานใน 3 ส่วนหลัก (Backend-GAS, Frontend, Modern-Backend MongoDB) เพื่อลดปัญหาความหน่วงและอาการค้างเมื่อข้อมูลมีปริมาณมากขึ้น

---

## 🛠️ รายละเอียดไฟล์ที่แก้ไข (Files Changed)

### 1. `backend/Code.gs` (Google Apps Script Backend)
- **Batch Write Optimization:** ปรับปรุงฟังก์ชัน `updateTask()` จากเดิมที่เขียนทีละเซลล์ (Cell-by-cell `setValue()`) เปลี่ยนมาเป็นการสร้างแถวข้อมูลในหน่วยความจำแล้วเขียนครั้งเดียวผ่าน `setValues()`
  - *ผลลัพธ์:* ลดจำนวนการเรียกใช้ Sheets API จาก ~17 ครั้ง เหลือเพียง **1 ครั้ง** ต่อการแก้ไขงาน (ลดอาการหน่วงในการเขียนข้อมูลลง ~10 เท่า)
- **User Caching & Invalidation:**
  - เพิ่ม cache ให้กับฟังก์ชัน `getUsers()` (TTL 120 วินาที) เนื่องจากข้อมูลผู้ใช้ไม่ค่อยมีการเปลี่ยนแปลง
  - เพิ่มคำสั่งล้าง cache (`clearUsersCache()`) ในฟังก์ชันการแก้ไขข้อมูลผู้ใช้ (`addUser`, `updateUser`, `deleteUser`)
- **Chunked Cache System:** เปิดระบบจัดการ chunk ข้อมูลขนาดใหญ่ที่สร้างไว้ เพื่อให้บันทึกข้อมูลเกิน 100KB ได้อย่างไร้ปัญหา

### 2. `frontend/src/services/api.js` (Frontend Caching Layer)
- **Tiered Cache TTL:** ปรับแต่งการตั้งเวลาลบข้อมูลแคชจำลองในเบราว์เซอร์ให้สอดคล้องกับความถี่ในการอัปเดตข้อมูลจริง
  - `getTasksSummary` / `getTasksPaged` / `getBriefings`: **30 วินาที** (อัปเดตบ่อย)
  - `getUsers` / `init`: **120 วินาที** (ไม่ค่อยเปลี่ยน)
  - `getPositions`: **300 วินาที** (แทบไม่เคยเปลี่ยน)
- **Stale-While-Revalidate:** ดึงข้อมูลที่เก็บในแคชมาแสดงผลในทันทีก่อน แล้วทำการอัปเดตข้อมูลจากเซิร์ฟเวอร์แบบเบื้องหลัง (Background refresh) เพื่อความลื่นไหล
- **Mutation Timestamp System:** ป้องกันไม่ให้แคชเก่าไปแสดงผลขัดแย้งกับการกระทำของผู้ใช้ โดยระบบจะบันทึกเวลาล่าสุดที่มีการแก้ไขข้อมูล (`lastMutationAt`) และบังคับให้ทุกหน้าดึงข้อมูลใหม่ทันทีหลังมีการอัปเดตเสร็จสิ้น
- **Selective Cache Invalidation:** ปรับปรุงฟังก์ชันการอัปเดตต่างๆ ให้เรียกใช้ `clearCacheFor()` แทนการใช้ `clearCache()` ล้างทิ้งทั้งหมด ทำให้การบันทึกงานไม่ไปกระทบหรือล้างข้อมูลของส่วนอื่น (เช่น ข้อมูลตำแหน่งงาน หรือข้อมูลผู้ใช้ที่โหลดมาแล้ว)

### 3. `modern-backend/models/Task.js` & `models/User.js` (Database Indexing)
- **Task Schema:** เพิ่ม Compound Index เพื่อสนับสนุนการทำงานของการคัดกรองข้อมูลหน้าเว็บหลักและการค้นหา
  - Index บนฟิลด์ `Status`, `UserID`, และ `Department`
  - Compound Index: `{ UserID: 1, Status: 1, Department: 1 }`
  - Sorting Index: `{ createdAt: -1 }`
- **User Schema:** เพิ่ม Compound Index สำหรับการค้นหาเพื่อล็อกอินอย่างรวดเร็ว
  - Index: `{ Username: 1, Password: 1 }`

### 4. `frontend/changelog.json` & `public/version.json` (System Documentation)
- อัปเดตข้อมูลความเปลี่ยนแปลงในวันนี้ (Layman's terms) เพื่อให้ผู้ใช้ทั่วไปเข้าใจง่ายและแสดงผลในตัวช่วยอัปเดตเวอร์ชันบนระบบ

---

## ⚡ ผลลัพธ์และตัววัดประสิทธิภาพ (Expected Performance Metrics)
- **ความเร็วในการบันทึกงาน:** จากเดิมเฉลี่ย 3-5 วินาที ลดลงเหลือเฉลี่ย **1 วินาที**
- **ความเร็วในการสลับหน้าจอ (Navigation):** แทบจะเป็นทันที (Instant) สำหรับหน้าจอที่เคยเปิดโหลดข้อมูลมาแล้วภายในระยะเวลา TTL
- **แบนด์วิดท์เซิร์ฟเวอร์:** ลดการส่งขอข้อมูลซ้ำซ้อนกับ Google Sheets API ลงมากกว่า 60%
