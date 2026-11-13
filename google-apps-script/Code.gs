/**
 * ============================================================================
 * ระบบติดตามคะแนน การส่งงาน และการเข้าเรียน (Smart Gradebook & Tracker)
 * Google Apps Script Backend (Code.gs)
 * - ซิงค์อัตโนมัติและลบแท็บวิชาเก่าที่ไม่ได้ใช้ใน Google Sheets ให้อัตโนมัติ 100%
 * ============================================================================
 */

const SHEET_NAMES = {
  DB_STORE: 'System_Database_JSON',
  SUMMARY_COURSES: 'สรุปวิชาและห้องเรียน',
  SUMMARY_GRADES: 'ตารางคะแนนและเกรดรวม',
  SETTINGS: 'ตั้งค่าระบบ'
};

/**
 * เริ่มต้นสร้างแผ่นงาน (Sheets) อัตโนมัติหากยังไม่มี
 */
function initSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. แผ่นงานสรุปวิชาและห้องเรียน
  let courseSheet = ss.getSheetByName(SHEET_NAMES.SUMMARY_COURSES);
  if (!courseSheet) {
    courseSheet = ss.insertSheet(SHEET_NAMES.SUMMARY_COURSES);
  }

  // 2. แผ่นงานตารางคะแนนและเกรดรวม
  let gradeSheet = ss.getSheetByName(SHEET_NAMES.SUMMARY_GRADES);
  if (!gradeSheet) {
    gradeSheet = ss.insertSheet(SHEET_NAMES.SUMMARY_GRADES);
  }

  // 3. แผ่นงานตั้งค่าระบบ (เก็บ PIN อาจารย์)
  let settingsSheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet(SHEET_NAMES.SETTINGS);
    settingsSheet.getRange('A1:B1').setValues([['คีย์การตั้งค่า (Setting Key)', 'ค่า (Value)']]).setFontWeight('bold').setBackground('#1e40af').setFontColor('#ffffff');
    settingsSheet.getRange('A2:B3').setValues([
      ['TEACHER_PIN', '1234'],
      ['LAST_UPDATED', new Date().toISOString()]
    ]);
    settingsSheet.setColumnWidth(1, 220);
    settingsSheet.setColumnWidth(2, 250);
  }

  // 4. แผ่นงานฐานข้อมูลหลัก (ซ่อนไว้เพื่อความสะอาดตา)
  let dbSheet = ss.getSheetByName(SHEET_NAMES.DB_STORE);
  if (!dbSheet) {
    dbSheet = ss.insertSheet(SHEET_NAMES.DB_STORE);
    dbSheet.getRange('A1:B1').setValues([['Key', 'JSON_Data']]).setFontWeight('bold');
    dbSheet.getRange('A2:B2').setValues([['APP_STATE', '']]);
  }
  try {
    dbSheet.hideSheet();
  } catch (e) {}

  return { ss, settingsSheet, dbSheet, gradeSheet, courseSheet };
}

function getCourseSheetName(course) {
  return (course.code + ' ' + course.name).substring(0, 30).replace(/[\\/?*\[\]:]/g, '').trim();
}

function getTeacherPin(settingsSheet) {
  const data = settingsSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === 'TEACHER_PIN') {
      return String(data[i][1]).trim();
    }
  }
  return '1234';
}

function setTeacherPin(settingsSheet, newPin) {
  const data = settingsSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === 'TEACHER_PIN') {
      settingsSheet.getRange(i + 1, 2).setValue(String(newPin).trim());
      return;
    }
  }
  settingsSheet.appendRow(['TEACHER_PIN', String(newPin).trim()]);
}

/**
 * สร้าง/อัปเดตตารางใน Google Sheets และลบแท็บวิชาเก่าที่ถูกลบหรือเปลี่ยนชื่อทิ้งอัตโนมัติ
 */
function updateReadableSheets(state) {
  if (!state || !state.courses) return;
  const { ss, gradeSheet, courseSheet } = initSheets();

  // รายชื่อแท็บที่ต้องเก็บไว้ (แท็บระบบ + แท็บวิชาปัจจุบันทั้งหมด)
  const keepSheetNames = new Set([
    SHEET_NAMES.DB_STORE,
    SHEET_NAMES.SUMMARY_COURSES,
    SHEET_NAMES.SUMMARY_GRADES,
    SHEET_NAMES.SETTINGS
  ]);

  state.courses.forEach(course => {
    keepSheetNames.add(getCourseSheetName(course));
  });

  // 1. อัปเดตแผ่นงาน "สรุปวิชาและห้องเรียน"
  courseSheet.clear();
  const courseHeaders = ['รหัสวิชา', 'ชื่อวิชา', 'ห้องเรียน/กลุ่มเรียน', 'ภาคเรียน/ปีการศึกษา', 'จำนวนนักเรียน (คน)', 'จำนวนช่องคะแนน', 'เกณฑ์เกรด A (>=)'];
  courseSheet.getRange(1, 1, 1, courseHeaders.length)
    .setValues([courseHeaders])
    .setFontWeight('bold')
    .setBackground('#1e3a8a')
    .setFontColor('#ffffff');

  const courseRows = [];
  state.courses.forEach(c => {
    const studentsInCourse = (state.students || []).filter(s => s.courseId === c.id);
    const classrooms = (c.classrooms || []).join(', ');
    const gradeA = (c.gradingScale && c.gradingScale['A'] !== undefined) ? c.gradingScale['A'] : 80;
    courseRows.push([
      c.code || '',
      c.name || '',
      classrooms,
      c.term || '',
      studentsInCourse.length,
      (c.assessments || []).length,
      gradeA
    ]);
  });

  if (courseRows.length > 0) {
    courseSheet.getRange(2, 1, courseRows.length, courseHeaders.length).setValues(courseRows);
  }
  courseSheet.autoResizeColumns(1, courseHeaders.length);

  // 2. อัปเดตแผ่นงาน "ตารางคะแนนและเกรดรวม"
  gradeSheet.clear();
  const gradeHeaders = [
    'รหัสวิชา', 'ชื่อวิชา', 'ห้องเรียน', 'เลขที่', 'รหัสนักเรียน', 'ชื่อ-นามสกุล',
    'การเข้าเรียน (%)', 'คะแนนเข้าเรียน', 'คะแนนงาน/การบ้าน', 'คะแนนรายงาน',
    'คะแนนสอบกลางภาค', 'คะแนนสอบปลายภาค', 'คะแนนอื่นๆ', 'คะแนนรวมสุทธิ', 'เกรดที่ได้', 'งานค้างส่ง (ชิ้น)'
  ];
  gradeSheet.getRange(1, 1, 1, gradeHeaders.length)
    .setValues([gradeHeaders])
    .setFontWeight('bold')
    .setBackground('#0f766e')
    .setFontColor('#ffffff');

  const allGradeRows = [];

  state.courses.forEach(course => {
    const courseStudents = (state.students || [])
      .filter(s => s.courseId === course.id)
      .sort((a, b) => (a.classroom || '').localeCompare(b.classroom || '') || (Number(a.number) || 0) - (Number(b.number) || 0));

    courseStudents.forEach(stu => {
      const calc = calculateStudentSummaryServer(course, stu, state.attendance || {});
      allGradeRows.push([
        course.code,
        course.name,
        stu.classroom || '-',
        stu.number || '-',
        stu.studentId || '-',
        stu.name || '-',
        calc.attendanceRate + '%',
        calc.categoryScores.attendance,
        calc.categoryScores.assignment,
        calc.categoryScores.report,
        calc.categoryScores.midterm,
        calc.categoryScores.final,
        calc.categoryScores.other,
        calc.totalScore,
        calc.grade,
        calc.missingCount
      ]);
    });

    // สร้างหรืออัปเดต Sheet แยกตามรายวิชา
    const safeSheetName = getCourseSheetName(course);
    let cSheet = ss.getSheetByName(safeSheetName);
    if (!cSheet) {
      cSheet = ss.insertSheet(safeSheetName);
    } else {
      cSheet.clear();
    }

    const assessments = course.assessments || [];
    const dynamicHeaders = [
      'ห้องเรียน', 'เลขที่', 'รหัสนักเรียน', 'ชื่อ-นามสกุล',
      `คะแนนเข้าเรียน (${course.attendanceMaxScore || 0})`,
      ...assessments.map(a => `${a.title} (${a.maxScore})`),
      'คะแนนรวม', 'เกรด', 'งานค้าง (ชิ้น)'
    ];
    cSheet.getRange(1, 1, 1, dynamicHeaders.length)
      .setValues([dynamicHeaders])
      .setFontWeight('bold')
      .setBackground('#1e40af')
      .setFontColor('#ffffff');

    const cRows = courseStudents.map(stu => {
      const calc = calculateStudentSummaryServer(course, stu, state.attendance || {});
      const itemScores = assessments.map(a => {
        const sc = (stu.scores && stu.scores[a.id]);
        if (!sc || sc.status === 'missing' || sc.score === '' || sc.score === null || sc.score === undefined) {
          return sc && sc.status === 'missing' ? 'ค้างส่ง' : '-';
        }
        return Number(sc.score);
      });
      return [
        stu.classroom || '-',
        stu.number || '-',
        stu.studentId || '-',
        stu.name || '-',
        calc.categoryScores.attendance,
        ...itemScores,
        calc.totalScore,
        calc.grade,
        calc.missingCount
      ];
    });

    if (cRows.length > 0) {
      cSheet.getRange(2, 1, cRows.length, dynamicHeaders.length).setValues(cRows);
    }
    cSheet.autoResizeColumns(1, dynamicHeaders.length);
  });

  if (allGradeRows.length > 0) {
    gradeSheet.getRange(2, 1, allGradeRows.length, gradeHeaders.length).setValues(allGradeRows);
  }
  gradeSheet.autoResizeColumns(1, gradeHeaders.length);

  // 3. ลบแท็บวิชาเก่าที่ถูกลบไปแล้วหรือแท็บว่างเริ่มต้น (เช่น Sheet1 / แผ่นงาน1 / วิชาตัวอย่างเดิม) อัตโนมัติ!
  const allSheets = ss.getSheets();
  allSheets.forEach(sh => {
    const shName = sh.getName();
    if (!keepSheetNames.has(shName) && ss.getSheets().length > 1) {
      try {
        ss.deleteSheet(sh);
      } catch (e) {}
    }
  });
}

function calculateStudentSummaryServer(course, student, attendanceAll) {
  const courseAtt = (attendanceAll && attendanceAll[course.id]) || {};
  const dates = Object.keys(courseAtt);
  let present = 0, late = 0, leave = 0, absent = 0, totalChecked = 0;

  dates.forEach(d => {
    const dayRecord = courseAtt[d] || {};
    const status = dayRecord[student.id];
    if (status) {
      totalChecked++;
      if (status === 'present') present++;
      else if (status === 'late') late++;
      else if (status === 'leave') leave++;
      else if (status === 'absent') absent++;
    }
  });

  const attendanceRate = totalChecked > 0 ? Math.round(((present + late * 0.75 + leave * 0.5) / totalChecked) * 100) : 100;
  const attMax = Number(course.attendanceMaxScore) || 0;
  const attendanceScore = totalChecked > 0
    ? Number(((present * 1 + late * 0.75 + leave * 0.5) / totalChecked * attMax).toFixed(2))
    : attMax;

  const categoryScores = {
    attendance: attendanceScore,
    assignment: 0,
    report: 0,
    midterm: 0,
    final: 0,
    other: 0
  };

  let missingCount = 0;
  const assessments = course.assessments || [];
  const stuScores = student.scores || {};

  assessments.forEach(a => {
    const rec = stuScores[a.id];
    const hasScore = rec && rec.score !== '' && rec.score !== null && rec.score !== undefined && !isNaN(Number(rec.score));
    const val = hasScore ? Number(rec.score) : 0;

    if (a.category === 'assignment' || a.category === 'report') {
      if (!rec || rec.status === 'missing' || (!hasScore && rec.status !== 'submitted')) {
        missingCount++;
      }
    }

    if (categoryScores[a.category] !== undefined) {
      categoryScores[a.category] = Number((categoryScores[a.category] + val).toFixed(2));
    } else {
      categoryScores.other = Number((categoryScores.other + val).toFixed(2));
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

  const scale = course.gradingScale || { 'A': 80, 'B+': 75, 'B': 70, 'C+': 65, 'C': 60, 'D+': 55, 'D': 50, 'F': 0 };
  let grade = 'F';
  const order = ['A', 'B+', 'B', 'C+', 'C', 'D+', 'D'];
  for (let i = 0; i < order.length; i++) {
    const g = order[i];
    if (totalScore >= Number(scale[g])) {
      grade = g;
      break;
    }
  }

  return { attendanceRate, categoryScores, totalScore, grade, missingCount };
}

function doGet(e) {
  try {
    const { dbSheet } = initSheets();
    const action = (e && e.parameter && e.parameter.action) || 'getState';
    const rawJson = dbSheet.getRange('B2').getValue();
    let state = rawJson ? JSON.parse(rawJson) : null;

    if (action === 'ping') {
      return jsonResponse({ ok: true, message: 'เชื่อมต่อกับ Google Sheets สำเร็จ!' });
    }

    if (action === 'studentLookup') {
      const studentId = String((e && e.parameter && e.parameter.studentId) || '').trim();
      if (!state) {
        return jsonResponse({ ok: true, found: false, records: [] });
      }
      const matchedStudents = (state.students || []).filter(
        s => String(s.studentId).trim().toLowerCase() === studentId.toLowerCase()
      );
      const records = matchedStudents.map(stu => {
        const course = (state.courses || []).find(c => c.id === stu.courseId);
        const courseAtt = (state.attendance && state.attendance[stu.courseId]) || {};
        const myAttendance = {};
        Object.keys(courseAtt).forEach(dateKey => {
          if (courseAtt[dateKey] && courseAtt[dateKey][stu.id]) {
            myAttendance[dateKey] = courseAtt[dateKey][stu.id];
          }
        });
        return {
          student: stu,
          course: course,
          attendance: myAttendance
        };
      });
      return jsonResponse({ ok: true, found: records.length > 0, records });
    }

    return jsonResponse({
      ok: true,
      hasData: !!state,
      state: state
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  }
}

function doPost(e) {
  try {
    const { dbSheet, settingsSheet } = initSheets();
    const body = JSON.parse(e.postData.contents || '{}');
    const action = body.action || 'saveState';
    const savedPin = getTeacherPin(settingsSheet);

    if (action === 'verifyPin') {
      const isValid = String(body.pin || '').trim() === savedPin;
      return jsonResponse({ ok: true, valid: isValid });
    }

    if (String(body.pin || '').trim() !== savedPin) {
      return jsonResponse({
        ok: false,
        error: 'รหัสผ่านอาจารย์ (PIN) ไม่ถูกต้อง ไม่สามารถแก้ไขข้อมูลใน Google Sheets ได้'
      });
    }

    if (action === 'changePin') {
      if (!body.newPin || String(body.newPin).trim().length < 4) {
        return jsonResponse({ ok: false, error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร' });
      }
      setTeacherPin(settingsSheet, body.newPin);
      return jsonResponse({ ok: true, message: 'เปลี่ยนรหัสผ่านอาจารย์เรียบร้อยแล้ว' });
    }

    if (action === 'saveState' && body.state) {
      dbSheet.getRange('B2').setValue(JSON.stringify(body.state));
      settingsSheet.getRange('B3').setValue(new Date().toISOString());
      updateReadableSheets(body.state);

      return jsonResponse({
        ok: true,
        updatedAt: new Date().toISOString(),
        message: 'บันทึกข้อมูลและอัปเดตตารางใน Google Sheets เรียบร้อยแล้ว'
      });
    }

    return jsonResponse({ ok: false, error: 'คำสั่งไม่ถูกต้อง (Unknown action)' });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
