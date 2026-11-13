/**
 * ============================================================================
 * ข้อมูลตัวอย่างเริ่มต้น (Sample Data) สำหรับทดลองใช้งานทันที
 * และโค้ด Google Apps Script สำหรับคัดลอกไปติดตั้งใน Google Sheets
 * ============================================================================
 */

const DEFAULT_GRADING_SCALE = {
  'A': 80,
  'B+': 75,
  'B': 70,
  'C+': 65,
  'C': 60,
  'D+': 55,
  'D': 50,
  'F': 0
};

const INITIAL_SAMPLE_STATE = {
  courses: [
    {
      id: 'course_1',
      code: 'ว30101',
      name: 'วิทยาศาสตร์และเทคโนโลยีสมัยใหม่',
      term: '1/2569',
      classrooms: ['ม.4/1', 'ม.4/2'],
      attendanceMaxScore: 10,
      gradingScale: { ...DEFAULT_GRADING_SCALE },
      assessments: [
        { id: 'as_101', title: 'ใบงานที่ 1: ทักษะกระบวนการวิทย์', category: 'assignment', maxScore: 10, dueDate: '2026-06-15' },
        { id: 'as_102', title: 'ใบงานที่ 2: การวิเคราะห์ข้อมูล', category: 'assignment', maxScore: 10, dueDate: '2026-07-01' },
        { id: 'as_103', title: 'รายงานกลุ่ม: นวัตกรรมพลังงานสะอาด', category: 'report', maxScore: 15, dueDate: '2026-08-10' },
        { id: 'as_104', title: 'สอบกลางภาค (Midterm)', category: 'midterm', maxScore: 20, dueDate: '2026-07-25' },
        { id: 'as_105', title: 'สอบปลายภาค (Final)', category: 'final', maxScore: 30, dueDate: '2026-09-30' },
        { id: 'as_106', title: 'จิตพิสัยและการมีส่วนร่วมในชั้นเรียน', category: 'other', maxScore: 5, dueDate: '2026-09-25' }
      ]
    },
    {
      id: 'course_2',
      code: 'ง30205',
      name: 'การเขียนโปรแกรมและการออกแบบเว็บ',
      term: '1/2569',
      classrooms: ['ม.5/1', 'ม.5/2'],
      attendanceMaxScore: 10,
      gradingScale: { ...DEFAULT_GRADING_SCALE },
      assessments: [
        { id: 'as_201', title: 'Lab 1: โครงสร้าง HTML & CSS', category: 'assignment', maxScore: 15, dueDate: '2026-06-20' },
        { id: 'as_202', title: 'Lab 2: JavaScript เบื้องต้น', category: 'assignment', maxScore: 15, dueDate: '2026-07-15' },
        { id: 'as_203', title: 'โครงงาน/รายงาน: เว็บแอปพลิเคชัน', category: 'report', maxScore: 20, dueDate: '2026-09-05' },
        { id: 'as_204', title: 'สอบกลางภาค (Midterm)', category: 'midterm', maxScore: 20, dueDate: '2026-07-28' },
        { id: 'as_205', title: 'สอบปลายภาค (Final)', category: 'final', maxScore: 20, dueDate: '2026-10-02' }
      ]
    }
  ],
  students: [
    // วิชาที่ 1 - ห้อง ม.4/1
    {
      id: 'stu_1',
      courseId: 'course_1',
      classroom: 'ม.4/1',
      number: 1,
      studentId: '6601001',
      name: 'นายกิตติพงศ์ รักเรียน',
      note: 'หัวหน้าห้อง ส่งงานตรงเวลาเสมอ',
      scores: {
        'as_101': { score: 9.5, status: 'submitted' },
        'as_102': { score: 9, status: 'submitted' },
        'as_103': { score: 14, status: 'submitted' },
        'as_104': { score: 18, status: 'submitted' },
        'as_105': { score: 26, status: 'submitted' },
        'as_106': { score: 5, status: 'submitted' }
      }
    },
    {
      id: 'stu_2',
      courseId: 'course_1',
      classroom: 'ม.4/1',
      number: 2,
      studentId: '6601002',
      name: 'นางสาวพิมพ์ชนก ใจดี',
      note: 'ตั้งใจเรียน',
      scores: {
        'as_101': { score: 8.5, status: 'submitted' },
        'as_102': { score: 8, status: 'submitted' },
        'as_103': { score: 13.5, status: 'submitted' },
        'as_104': { score: 15.5, status: 'submitted' },
        'as_105': { score: 23, status: 'submitted' },
        'as_106': { score: 5, status: 'submitted' }
      }
    },
    {
      id: 'stu_3',
      courseId: 'course_1',
      classroom: 'ม.4/1',
      number: 3,
      studentId: '6601003',
      name: 'นายธนกร มุ่งมั่น',
      note: 'ส่งงานช้าบางครั้ง',
      scores: {
        'as_101': { score: 7, status: 'late' },
        'as_102': { score: 6.5, status: 'submitted' },
        'as_103': { score: 11, status: 'submitted' },
        'as_104': { score: 13, status: 'submitted' },
        'as_105': { score: 19, status: 'submitted' },
        'as_106': { score: 4, status: 'submitted' }
      }
    },
    {
      id: 'stu_4',
      courseId: 'course_1',
      classroom: 'ม.4/1',
      number: 4,
      studentId: '6601004',
      name: 'นายศุภณัฐ สายเสมอ',
      note: 'ต้องติดตามงานรายงานและใบงานที่ 2',
      scores: {
        'as_101': { score: 6, status: 'late' },
        'as_102': { score: '', status: 'missing' },
        'as_103': { score: '', status: 'missing' },
        'as_104': { score: 9, status: 'submitted' },
        'as_105': { score: 14, status: 'submitted' },
        'as_106': { score: 3, status: 'submitted' }
      }
    },
    // วิชาที่ 1 - ห้อง ม.4/2
    {
      id: 'stu_5',
      courseId: 'course_1',
      classroom: 'ม.4/2',
      number: 1,
      studentId: '6601005',
      name: 'นางสาวณัฐธิดา ปัญญาเลิศ',
      note: 'คะแนนสูงสุดของห้อง ม.4/2',
      scores: {
        'as_101': { score: 10, status: 'submitted' },
        'as_102': { score: 10, status: 'submitted' },
        'as_103': { score: 14.5, status: 'submitted' },
        'as_104': { score: 19, status: 'submitted' },
        'as_105': { score: 28, status: 'submitted' },
        'as_106': { score: 5, status: 'submitted' }
      }
    },
    {
      id: 'stu_6',
      courseId: 'course_1',
      classroom: 'ม.4/2',
      number: 2,
      studentId: '6601006',
      name: 'นายพีรพัฒน์ สุขสำราญ',
      note: 'ค้างส่งใบงานที่ 2',
      scores: {
        'as_101': { score: 7.5, status: 'submitted' },
        'as_102': { score: '', status: 'missing' },
        'as_103': { score: 12, status: 'submitted' },
        'as_104': { score: 12, status: 'submitted' },
        'as_105': { score: 18, status: 'submitted' },
        'as_106': { score: 4, status: 'submitted' }
      }
    },
    {
      id: 'stu_7',
      courseId: 'course_1',
      classroom: 'ม.4/2',
      number: 3,
      studentId: '6601007',
      name: 'นางสาวอารยา สดใส',
      note: '',
      scores: {
        'as_101': { score: 8, status: 'submitted' },
        'as_102': { score: 7.5, status: 'submitted' },
        'as_103': { score: 12.5, status: 'submitted' },
        'as_104': { score: 14, status: 'submitted' },
        'as_105': { score: 20, status: 'submitted' },
        'as_106': { score: 4.5, status: 'submitted' }
      }
    },

    // วิชาที่ 2 - ห้อง ม.5/1 (เพิ่มรหัส 6601001 เรียน 2 วิชาเพื่อทดสอบหน้าค้นหานักเรียน)
    {
      id: 'stu_8',
      courseId: 'course_2',
      classroom: 'ม.5/1',
      number: 1,
      studentId: '6601001',
      name: 'นายกิตติพงศ์ รักเรียน',
      note: 'ลงเรียนวิชาเลือกเพิ่มเติม',
      scores: {
        'as_201': { score: 14, status: 'submitted' },
        'as_202': { score: 13.5, status: 'submitted' },
        'as_203': { score: 19, status: 'submitted' },
        'as_204': { score: 17, status: 'submitted' },
        'as_205': { score: 18, status: 'submitted' }
      }
    },
    {
      id: 'stu_9',
      courseId: 'course_2',
      classroom: 'ม.5/1',
      number: 2,
      studentId: '6502001',
      name: 'นายชยพล โค้ดดิ้งเก่ง',
      note: 'ทำโครงงานได้ดีมาก',
      scores: {
        'as_201': { score: 15, status: 'submitted' },
        'as_202': { score: 14, status: 'submitted' },
        'as_203': { score: 19.5, status: 'submitted' },
        'as_204': { score: 18, status: 'submitted' },
        'as_205': { score: 17.5, status: 'submitted' }
      }
    },
    {
      id: 'stu_10',
      courseId: 'course_2',
      classroom: 'ม.5/1',
      number: 3,
      studentId: '6502002',
      name: 'นางสาวกานต์พิชชา พัฒนาเว็บ',
      note: 'ค้างส่งโครงงานปลายภาค',
      scores: {
        'as_201': { score: 12, status: 'submitted' },
        'as_202': { score: 11, status: 'late' },
        'as_203': { score: '', status: 'missing' },
        'as_204': { score: 13, status: 'submitted' },
        'as_205': { score: 14, status: 'submitted' }
      }
    },
    // วิชาที่ 2 - ห้อง ม.5/2
    {
      id: 'stu_11',
      courseId: 'course_2',
      classroom: 'ม.5/2',
      number: 1,
      studentId: '6502003',
      name: 'นายวรเมธ เกมเมอร์',
      note: 'ขาดเรียนบ่อย ต้องติดตามเรื่องส่ง Lab 2',
      scores: {
        'as_201': { score: 9, status: 'late' },
        'as_202': { score: '', status: 'missing' },
        'as_203': { score: 10, status: 'late' },
        'as_204': { score: 8, status: 'submitted' },
        'as_205': { score: 9, status: 'submitted' }
      }
    }
  ],
  attendance: {
    'course_1': {
      '2026-11-02': {
        'stu_1': 'present',
        'stu_2': 'present',
        'stu_3': 'present',
        'stu_4': 'late',
        'stu_5': 'present',
        'stu_6': 'present',
        'stu_7': 'present'
      },
      '2026-11-04': {
        'stu_1': 'present',
        'stu_2': 'present',
        'stu_3': 'late',
        'stu_4': 'absent',
        'stu_5': 'present',
        'stu_6': 'leave',
        'stu_7': 'present'
      },
      '2026-11-09': {
        'stu_1': 'present',
        'stu_2': 'present',
        'stu_3': 'present',
        'stu_4': 'absent',
        'stu_5': 'present',
        'stu_6': 'present',
        'stu_7': 'present'
      }
    },
    'course_2': {
      '2026-11-03': {
        'stu_8': 'present',
        'stu_9': 'present',
        'stu_10': 'present',
        'stu_11': 'late'
      },
      '2026-11-06': {
        'stu_8': 'present',
        'stu_9': 'present',
        'stu_10': 'late',
        'stu_11': 'absent'
      }
    }
  }
};
