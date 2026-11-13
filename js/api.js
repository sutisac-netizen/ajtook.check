/**
 * ============================================================================
 * บริการจัดการข้อมูลและเชื่อมต่อ Google Sheets (Data & Google Sheets Sync Service)
 * ============================================================================
 */

// ลิงก์ Web App URL ของอาจารย์ (ฝังไว้ในโค้ดเพื่อให้ทุกเครื่องและมือถือเชื่อม Google Sheets อัตโนมัติทันที)
const DEFAULT_GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbypDku9so6iV0fiVxD86O9vjt64_BbBHIl_7XLXli4qYyCtD0Wbc1w9hMpEOD1xrCDr9Q/exec';

const STORAGE_KEYS = {
  STATE: 'smart_gradebook_state_v1',
  CONFIG: 'smart_gradebook_config_v1',
  AUTH_SESSION: 'smart_gradebook_teacher_session_v1'
};

const GradebookAPI = {
  /**
   * โหลดการตั้งค่าการเชื่อมต่อ Google Sheets
   */
  getConfig() {
    const raw = localStorage.getItem(STORAGE_KEYS.CONFIG);
    const parsed = raw ? JSON.parse(raw) : {};
    const urlParams = new URLSearchParams(window.location.search);
    const apiFromUrl = urlParams.get('api');

    // หากเปิดผ่านลิงก์ที่มี ?api=... ให้บันทึกไว้ในเครื่อง (เช่น มือถือ) อัตโนมัติทันที
    if (apiFromUrl && apiFromUrl !== parsed.scriptUrl) {
      parsed.scriptUrl = apiFromUrl;
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(parsed));
    }

    return {
      scriptUrl: apiFromUrl || parsed.scriptUrl || DEFAULT_GOOGLE_SCRIPT_URL || '',
      localTeacherPin: parsed.localTeacherPin || '1234',
      autoSync: parsed.autoSync !== undefined ? parsed.autoSync : true,
      lastSyncedAt: parsed.lastSyncedAt || null
    };
  },

  saveConfig(newConfig) {
    const current = this.getConfig();
    const merged = { ...current, ...newConfig };
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(merged));
    return merged;
  },

  /**
   * ตรวจสอบสถานะล็อกอินของอาจารย์ในเซสชันปัจจุบัน
   */
  getTeacherSession() {
    const raw = sessionStorage.getItem(STORAGE_KEYS.AUTH_SESSION);
    if (!raw) return { loggedIn: false, pin: '' };
    try {
      return JSON.parse(raw);
    } catch (e) {
      return { loggedIn: false, pin: '' };
    }
  },

  setTeacherSession(loggedIn, pin = '') {
    sessionStorage.setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify({ loggedIn, pin }));
  },

  /**
   * โหลดข้อมูลทั้งหมดจาก LocalStorage (หรือใช้ข้อมูลตัวอย่างหากเปิดครั้งแรก)
   */
  loadLocalState() {
    const raw = localStorage.getItem(STORAGE_KEYS.STATE);
    if (!raw) {
      const initial = JSON.parse(JSON.stringify(INITIAL_SAMPLE_STATE));
      localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(initial));
      return initial;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      return JSON.parse(JSON.stringify(INITIAL_SAMPLE_STATE));
    }
  },

  /**
   * บันทึกข้อมูลลง LocalStorage
   */
  saveLocalState(state) {
    localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(state));
  },

  /**
   * รีเซ็ตกลับเป็นข้อมูลตัวอย่างเริ่มต้น
   */
  resetToSampleData() {
    const initial = JSON.parse(JSON.stringify(INITIAL_SAMPLE_STATE));
    localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(initial));
    return initial;
  },

  /**
   * ดึงข้อมูลล่าสุดจาก Google Sheets (ผ่าน Web App URL)
   */
  async fetchFromGoogleSheets() {
    const config = this.getConfig();
    if (!config.scriptUrl) {
      return { ok: false, reason: 'NO_URL', message: 'ยังไม่ได้ตั้งค่า URL ของ Google Apps Script' };
    }

    try {
      const url = new URL(config.scriptUrl);
      url.searchParams.set('action', 'getState');
      url.searchParams.set('_t', Date.now());

      const response = await fetch(url.toString(), {
        method: 'GET',
        redirect: 'follow'
      });
      const data = await response.json();

      if (data && data.ok) {
        if (data.hasData && data.state) {
          this.saveLocalState(data.state);
          this.saveConfig({ lastSyncedAt: new Date().toISOString() });
          return { ok: true, state: data.state, emptyRemote: false };
        }
        return { ok: true, state: null, emptyRemote: true };
      }
      return { ok: false, message: (data && data.error) || 'ไม่สามารถดึงข้อมูลจาก Google Sheets ได้' };
    } catch (err) {
      return { ok: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ Google Sheets: ' + err.message };
    }
  },

  /**
   * บันทึกข้อมูลขึ้น Google Sheets (ต้องใช้ PIN อาจารย์)
   */
  async pushToGoogleSheets(state, pinOverride = null) {
    const config = this.getConfig();
    if (!config.scriptUrl) {
      return { ok: false, reason: 'NO_URL', message: 'ยังไม่ได้ตั้งค่า Google Sheets Web App URL' };
    }

    const session = this.getTeacherSession();
    const pin = pinOverride || session.pin || config.localTeacherPin || '1234';

    try {
      // ส่งแบบ text/plain เพื่อหลีกเลี่ยงปัญหา CORS preflight กับ Google Apps Script
      const response = await fetch(config.scriptUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({
          action: 'saveState',
          pin: pin,
          state: state
        })
      });

      const data = await response.json();
      if (data && data.ok) {
        this.saveConfig({ lastSyncedAt: data.updatedAt || new Date().toISOString() });
        return { ok: true, message: data.message || 'ซิงค์ข้อมูลกับ Google Sheets สำเร็จ!' };
      }
      return { ok: false, message: (data && data.error) || 'บันทึกข้อมูลไม่สำเร็จ' };
    } catch (err) {
      return { ok: false, message: 'เชื่อมต่อไม่สำเร็จ: ' + err.message };
    }
  },

  /**
   * ตรวจสอบรหัสผ่านอาจารย์ (กับ Google Sheets ถ้าเชื่อมอยู่ หรือกับ Local PIN)
   */
  async verifyTeacherPin(inputPin) {
    const config = this.getConfig();
    const cleanPin = String(inputPin || '').trim();

    if (config.scriptUrl) {
      try {
        const response = await fetch(config.scriptUrl, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'verifyPin',
            pin: cleanPin
          })
        });
        const data = await response.json();
        if (data && data.ok) {
          if (data.valid) {
            this.saveConfig({ localTeacherPin: cleanPin });
          }
          return { ok: true, valid: !!data.valid, source: 'google_sheets' };
        }
      } catch (e) {
        // กรณีออฟไลน์ ให้ตรวจสอบกับรหัสผ่านในเครื่องแทน
      }
    }

    const isValid = cleanPin === String(config.localTeacherPin || '1234').trim();
    return { ok: true, valid: isValid, source: 'local' };
  },

  /**
   * เปลี่ยนรหัสผ่านอาจารย์
   */
  async changeTeacherPin(currentPin, newPin) {
    const config = this.getConfig();
    const cleanCurrent = String(currentPin || '').trim();
    const cleanNew = String(newPin || '').trim();

    if (cleanNew.length < 4) {
      return { ok: false, message: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร' };
    }

    if (config.scriptUrl) {
      try {
        const response = await fetch(config.scriptUrl, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'changePin',
            pin: cleanCurrent,
            newPin: cleanNew
          })
        });
        const data = await response.json();
        if (!data || !data.ok) {
          return { ok: false, message: (data && data.error) || 'ไม่สามารถเปลี่ยนรหัสผ่านบน Google Sheets ได้' };
        }
      } catch (err) {
        return { ok: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ Google Sheets: ' + err.message };
      }
    } else {
      if (cleanCurrent !== String(config.localTeacherPin || '1234').trim()) {
        return { ok: false, message: 'รหัสผ่านเดิมไม่ถูกต้อง' };
      }
    }

    this.saveConfig({ localTeacherPin: cleanNew });
    this.setTeacherSession(true, cleanNew);
    return { ok: true, message: 'เปลี่ยนรหัสผ่านอาจารย์เรียบร้อยแล้ว!' };
  },

  /**
   * คำนวณคะแนนเต็มทั้งหมดของรายวิชา
   */
  calculateCourseMaxScore(course) {
    if (!course) return 100;
    const attMax = Number(course.attendanceMaxScore) || 0;
    const assessMax = (course.assessments || []).reduce((sum, a) => sum + (Number(a.maxScore) || 0), 0);
    return Number((attMax + assessMax).toFixed(2));
  },

  /**
   * คำนวณสถิติการเข้าเรียน คะแนนแยกตามหมวด คะแนนรวม และตัดเกรด 8 ระดับ (A, B+, B, C+, C, D+, D, F)
   */
  calculateStudentSummary(course, student, attendanceAll) {
    if (!course || !student) {
      return {
        attendanceStats: { present: 0, late: 0, leave: 0, absent: 0, totalDays: 0, rate: 100 },
        categoryScores: { attendance: 0, assignment: 0, report: 0, midterm: 0, final: 0, other: 0 },
        categoryMax: { attendance: 0, assignment: 0, report: 0, midterm: 0, final: 0, other: 0 },
        totalScore: 0,
        maxTotalScore: 100,
        grade: 'F',
        missingAssignments: [],
        submittedCount: 0,
        totalAssignableCount: 0
      };
    }

    const courseAtt = (attendanceAll && attendanceAll[course.id]) || {};
    const dates = Object.keys(courseAtt).sort();
    let present = 0, late = 0, leave = 0, absent = 0, totalDays = 0;
    const attendanceHistory = [];

    dates.forEach(dateStr => {
      const dayMap = courseAtt[dateStr] || {};
      const status = dayMap[student.id];
      if (status) {
        totalDays++;
        if (status === 'present') present++;
        else if (status === 'late') late++;
        else if (status === 'leave') leave++;
        else if (status === 'absent') absent++;
        attendanceHistory.push({ date: dateStr, status });
      }
    });

    const attendanceRate = totalDays > 0
      ? Math.round(((present + late * 0.75 + leave * 0.5) / totalDays) * 100)
      : 100;

    const attMax = Number(course.attendanceMaxScore) || 0;
    const attendanceScore = totalDays > 0
      ? Number((((present * 1 + late * 0.75 + leave * 0.5) / totalDays) * attMax).toFixed(2))
      : attMax;

    const categoryScores = {
      attendance: attendanceScore,
      assignment: 0,
      report: 0,
      midterm: 0,
      final: 0,
      other: 0
    };

    const categoryMax = {
      attendance: attMax,
      assignment: 0,
      report: 0,
      midterm: 0,
      final: 0,
      other: 0
    };

    const missingAssignments = [];
    let submittedCount = 0;
    let totalAssignableCount = 0;

    const stuScores = student.scores || {};
    (course.assessments || []).forEach(assess => {
      const cat = categoryScores[assess.category] !== undefined ? assess.category : 'other';
      const maxVal = Number(assess.maxScore) || 0;
      categoryMax[cat] = Number((categoryMax[cat] + maxVal).toFixed(2));

      const rec = stuScores[assess.id] || {};
      const rawScore = rec.score;
      const hasScore = rawScore !== '' && rawScore !== null && rawScore !== undefined && !isNaN(Number(rawScore));
      const numScore = hasScore ? Math.min(maxVal, Math.max(0, Number(rawScore))) : 0;

      categoryScores[cat] = Number((categoryScores[cat] + numScore).toFixed(2));

      // นับการส่งงานสำหรับใบงาน/การบ้านและรายงาน
      if (assess.category === 'assignment' || assess.category === 'report') {
        totalAssignableCount++;
        const isMissing = rec.status === 'missing' || (!hasScore && rec.status !== 'submitted' && rec.status !== 'late');
        if (isMissing) {
          missingAssignments.push(assess);
        } else {
          submittedCount++;
        }
      }
    });

    const totalScore = Number((
      categoryScores.attendance +
      categoryScores.assignment +
      categoryScores.report +
      categoryScores.midterm +
      categoryScores.final +
      categoryScores.other
    ).toFixed(2));

    const maxTotalScore = Number((
      categoryMax.attendance +
      categoryMax.assignment +
      categoryMax.report +
      categoryMax.midterm +
      categoryMax.final +
      categoryMax.other
    ).toFixed(2));

    const scale = course.gradingScale || DEFAULT_GRADING_SCALE;
    const gradeOrder = ['A', 'B+', 'B', 'C+', 'C', 'D+', 'D'];
    let grade = 'F';
    for (const g of gradeOrder) {
      if (totalScore >= Number(scale[g])) {
        grade = g;
        break;
      }
    }

    return {
      attendanceStats: { present, late, leave, absent, totalDays, rate: attendanceRate, history: attendanceHistory },
      categoryScores,
      categoryMax,
      totalScore,
      maxTotalScore,
      grade,
      missingAssignments,
      submittedCount,
      totalAssignableCount
    };
  },

  /**
   * คืนค่าคลาส CSS สำหรับแสดงป้ายเกรด 8 ระดับ
   */
  getGradeBadgeClass(grade) {
    const map = {
      'A': 'grade-A',
      'B+': 'grade-Bplus',
      'B': 'grade-B',
      'C+': 'grade-Cplus',
      'C': 'grade-C',
      'D+': 'grade-Dplus',
      'D': 'grade-D',
      'F': 'grade-F'
    };
    return map[grade] || 'grade-F';
  },

  /**
   * แปลงชื่อหมวดหมู่เป็นภาษาไทย
   */
  getCategoryLabel(category) {
    const labels = {
      attendance: 'การเข้าเรียน',
      assignment: 'งาน/ใบงาน',
      report: 'รายงาน/โครงงาน',
      midterm: 'สอบกลางภาค',
      final: 'สอบปลายภาค',
      other: 'คะแนนอื่นๆ/จิตพิสัย'
    };
    return labels[category] || 'อื่นๆ';
  }
};
