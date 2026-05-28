const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

// Determine GAS URL from frontend .env or fallback
let GAS_URL = 'https://script.google.com/macros/s/AKfycbwvF92oQipNAlQG15FflcRS3hSfJuUDz7Z-scdEmo0qqL0bzcJdnUsrs3tvUwXUzLeCfA/exec';
try {
  const frontendEnvPath = path.join(__dirname, '../../frontend/.env');
  if (fs.existsSync(frontendEnvPath)) {
    const lines = fs.readFileSync(frontendEnvPath, 'utf8').split('\n');
    for (const line of lines) {
      if (line.startsWith('VITE_GAS_WEBAPP_URL=')) {
        GAS_URL = line.split('=')[1].trim();
        break;
      }
    }
  }
} catch (e) {
  console.log('Using default GAS URL fallback...');
}

// Helper to parse JSON values safely
function parseJson(val, defaultVal = {}) {
  if (!val) return defaultVal;
  if (typeof val === 'object') return val;
  try {
    const cleaned = val.trim();
    if (cleaned.startsWith('{') || cleaned.startsWith('[')) {
      return JSON.parse(cleaned);
    }
  } catch (e) {}
  return defaultVal;
}

// Helper to parse dates safely for Postgres
function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function fetchFromGas(action, data = {}, timeoutMs = 12000, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action, data, executorId: 'MigrationScript' }),
        signal: controller.signal
      });
      clearTimeout(id);
      const result = await response.json();
      if (result.status === 'error') {
        throw new Error(result.message);
      }
      return result.data;
    } catch (e) {
      clearTimeout(id);
      if (attempt === maxRetries) {
        throw e;
      }
      console.warn(`⚠️ Fetch failed for ${action} (attempt ${attempt}/${maxRetries}): ${e.message}. Retrying in 1.5s...`);
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

async function seed() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Error: Missing Supabase credentials in .env');
    process.exit(1);
  }

  console.log('🔄 Connecting to Supabase...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  // Helper for batch inserting
  const upsertData = async (tableName, records, matchKey = 'ID') => {
    if (!records.length) {
      console.log(`ℹ️ No records to insert into "${tableName}".`);
      return;
    }

    console.log(`📤 Upserting ${records.length} records into "${tableName}"...`);
    
    // Chunk requests to avoid payload limits
    const CHUNK_SIZE = 100;
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase
        .from(tableName)
        .upsert(chunk, { onConflict: matchKey });

      if (error) {
        console.error(`❌ Error upserting chunk to "${tableName}":`, error);
        throw error;
      }
    }
    console.log(`✅ Finished seeding "${tableName}" successfully.`);
  };

  try {
    // ==========================================
    // 1. Fetch & Seed Positions
    // ==========================================
    const rawPositions = await fetchFromGas('getPositions');
    const positions = rawPositions.map(data => ({
      ID: data.ID,
      Name: data.Name,
      Color: data.Color || 'bg-blue-100 text-blue-600',
      CreatedAt: parseDate(data.CreatedAt || data.UpdatedAt) || new Date().toISOString(),
      UpdatedAt: parseDate(data.UpdatedAt || data.CreatedAt) || new Date().toISOString()
    })).filter(r => r.ID && r.Name);
    
    await upsertData('Positions', positions, 'ID');

    // ==========================================
    // 2. Fetch & Seed Users
    // ==========================================
    const rawUsers = await fetchFromGas('getUsers');
    const validUserIds = new Set();
    const users = rawUsers.map(data => {
      validUserIds.add(String(data.ID));
      return {
        ID: data.ID,
        Username: data.Username,
        Password: data.Password,
        Role: data.Role || 'Staff',
        Department: data.Department || null,
        Name: data.Name || null,
        ProfileImage: data.ProfileImage || null,
        Position: data.Position || null,
        Permissions: parseJson(data.Permissions, {}),
        CreatedAt: parseDate(data.CreatedAt || data.UpdatedAt) || new Date().toISOString(),
        UpdatedAt: parseDate(data.UpdatedAt || data.CreatedAt) || new Date().toISOString()
      };
    }).filter(r => r.ID && r.Username);

    await upsertData('Users', users, 'ID');

    // ==========================================
    // 3. Fetch & Seed Tasks
    // ==========================================
    const rawTasks = await fetchFromGas('getTasks');
    const tasks = rawTasks.map(data => {
      const userIdRef = data.UserID && validUserIds.has(String(data.UserID)) ? data.UserID : null;
      return {
        ID: data.ID,
        Detail: data.Detail || null,
        Status: data.Status || null,
        Priority: data.Priority || null,
        StartDate: data.StartDate || null,
        DueDate: data.DueDate || null,
        UserID: userIdRef,
        StaffName: data.StaffName || null,
        Department: data.Department || null,
        Note: data.Note || null,
        CustomFields: parseJson(data.CustomFields, {}),
        Image1: data.Image1 || null,
        Image2: data.Image2 || null,
        Image3: data.Image3 || null,
        Image4: data.Image4 || null,
        CreatedAt: parseDate(data.CreatedAt || data.UpdatedAt) || new Date().toISOString(),
        UpdatedAt: parseDate(data.UpdatedAt || data.CreatedAt) || new Date().toISOString(),
        CompletedAt: parseDate(data.CompletedAt)
      };
    }).filter(r => r.ID);

    await upsertData('Tasks', tasks, 'ID');

    // ==========================================
    // 4. Fetch & Seed Briefings
    // ==========================================
    const rawBriefings = await fetchFromGas('getBriefings');
    const validBriefingIds = new Set();
    const briefings = rawBriefings.map(data => {
      validBriefingIds.add(String(data.ID));
      const creatorIdRef = data.CreatorID && validUserIds.has(String(data.CreatorID)) ? data.CreatorID : null;
      const lastUpdatedByRef = data.LastUpdatedBy && validUserIds.has(String(data.LastUpdatedBy)) ? data.LastUpdatedBy : null;
      
      return {
        ID: data.ID,
        RunningID: data.RunningID || null,
        Title: data.Title || null,
        CreatorID: creatorIdRef,
        Detail: data.Detail || null,
        CreatorNote: data.CreatorNote || null,
        Assignees: parseJson(data.Assignees, []),
        Status: data.Status || 'รอดำเนินการ',
        Priority: data.Priority || null,
        StartDate: data.StartDate || null,
        DueDate: data.DueDate || null,
        RefImage1: data.RefImage1 || null,
        RefImage2: data.RefImage2 || null,
        RefImage3: data.RefImage3 || null,
        RefImage4: data.RefImage4 || null,
        RefImage5: data.RefImage5 || null,
        RefImage6: data.RefImage6 || null,
        RefURL: data.RefURL || null,
        LastUpdatedBy: lastUpdatedByRef,
        CreatedAt: parseDate(data.CreatedAt || data.UpdatedAt) || new Date().toISOString(),
        UpdatedAt: parseDate(data.UpdatedAt || data.CreatedAt) || new Date().toISOString(),
        CompletedAt: parseDate(data.CompletedAt),
        CardColor: data.CardColor || null,
        PostStatus: data.PostStatus || 'ยังไม่โพส',
        PostUrl: data.PostUrl || null,
        PostDate: data.PostDate || null
      };
    }).filter(r => r.ID);

    await upsertData('Briefings', briefings, 'ID');

    // ==========================================
    // 5. Fetch & Seed Briefing Responses (Parallelized)
    // ==========================================
    console.log(`📡 Fetching briefing responses for ${validBriefingIds.size} briefings in parallel batches...`);
    const briefingResponses = [];
    const briefingIdArray = Array.from(validBriefingIds);
    const BATCH_CONCURRENCY = 5;

    for (let i = 0; i < briefingIdArray.length; i += BATCH_CONCURRENCY) {
      const batch = briefingIdArray.slice(i, i + BATCH_CONCURRENCY);
      console.log(`   Processing batch ${Math.floor(i / BATCH_CONCURRENCY) + 1}/${Math.ceil(briefingIdArray.length / BATCH_CONCURRENCY)}...`);
      
      const promises = batch.map(async (briefingId) => {
        try {
          const rawResponses = await fetchFromGas('getBriefingResponses', { briefingId });
          for (const data of rawResponses) {
            const userIdRef = data.UserID && validUserIds.has(String(data.UserID)) ? data.UserID : null;
            if (userIdRef) {
              briefingResponses.push({
                ID: data.ID,
                BriefingID: briefingId,
                UserID: userIdRef,
                ResultImage1: data.ResultImage1 || null,
                ResultImage2: data.ResultImage2 || null,
                ResultImage3: data.ResultImage3 || null,
                ResultImage4: data.ResultImage4 || null,
                ResultImage5: data.ResultImage5 || null,
                ResultImage6: data.ResultImage6 || null,
                URL1: data.URL1 || null,
                URL2: data.URL2 || null,
                Status: data.Status || null,
                Note: data.Note || null,
                ReviewImage1: data.ReviewImage1 || null,
                ReviewImage2: data.ReviewImage2 || null,
                ReviewImage3: data.ReviewImage3 || null,
                ReviewImage4: data.ReviewImage4 || null,
                ReviewImage5: data.ReviewImage5 || null,
                ReviewImage6: data.ReviewImage6 || null,
                UpdatedAt: parseDate(data.UpdatedAt) || new Date().toISOString()
              });
            }
          }
        } catch (e) {
          console.warn(`⚠️ Failed to fetch responses for briefing ${briefingId}:`, e.message);
        }
      });
      
      await Promise.all(promises);
    }

    const filteredResponses = briefingResponses.filter(r => r.ID);
    await upsertData('BriefingResponses', filteredResponses, 'ID');

    console.log('🎉 Seeding to Supabase completed successfully!');
  } catch (error) {
    console.error('❌ Seeding process failed:', error);
    process.exit(1);
  }
}

seed();
