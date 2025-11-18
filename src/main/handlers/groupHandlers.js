const { ipcMain } = require('electron');
const { runQuery, getQuery, allQuery } = require('../../db/db');
const { mapCategory } = require('../utils/translations');

/**
 * Calculates age from date of birth.
 * Uses the same logic as the frontend calculateAge function.
 *
 * @param {string} birthDateString - Date of birth in YYYY-MM-DD format
 * @returns {number|null} Age in years or null if invalid date
 */
function calculateAge(birthDateString) {
  if (!birthDateString) return null;

  const birthDate = new Date(birthDateString);
  if (isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();

  // Adjust age if birthday hasn't occurred this year yet
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }

  return age;
}

function registerGroupHandlers() {
  // Groups Management
  ipcMain.handle('groups:get', async (event, filters = {}) => {
    try {
      let query = `
        SELECT g.*,
               (SELECT COUNT(*) FROM student_groups sg WHERE sg.group_id = g.id) AS studentCount
        FROM groups g
      `;
      const params = [];
      const conditions = [];

      if (filters.name) {
        conditions.push('g.name LIKE ?');
        params.push(`%${filters.name}%`);
      }

      if (filters.category) {
        conditions.push('g.category = ?');
        params.push(filters.category);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY g.name ASC';

      let groups = await allQuery(query, params);

      // Apply translations to category
      groups = groups.map(group => ({
        ...group,
        category: mapCategory(group.category),
      }));

      return { success: true, data: groups };
    } catch (error) {
      console.error('Error fetching groups:', error);
      return { success: false, message: 'فشل في جلب بيانات المجموعات.' };
    }
  });

  ipcMain.handle('groups:add', async (event, groupData) => {
    try {
      const { name, description, category, studentIds } = groupData;
      const query = `
        INSERT INTO groups (name, description, category)
        VALUES (?, ?, ?)
      `;
      const result = await runQuery(query, [name, description, category]);

      // If students were selected, assign them to the new group
      if (studentIds && studentIds.length > 0) {
        const insertGroupSql = 'INSERT INTO student_groups (student_id, group_id) VALUES (?, ?)';
        for (const studentId of studentIds) {
          await runQuery(insertGroupSql, [studentId, result.id]);
        }
      }

      return { success: true, data: { id: result.id, ...groupData } };
    } catch (error) {
      console.error('Error adding group:', error);
      if (error.message.includes('UNIQUE constraint failed: groups.name')) {
        return { success: false, message: 'يوجد مجموعة بهذا الاسم بالفعل.' };
      }
      return { success: false, message: 'فشل في إضافة المجموعة.' };
    }
  });

  ipcMain.handle('groups:update', async (event, id, groupData) => {
    try {
      const { name, description, category, studentIds } = groupData;
      const query = `
        UPDATE groups
        SET name = ?, description = ?, category = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      await runQuery(query, [name, description, category, id]);

      // Update student assignments if provided
      if (studentIds !== undefined) {
        // Remove all existing assignments
        await runQuery('DELETE FROM student_groups WHERE group_id = ?', [id]);

        // Add new assignments
        if (studentIds && studentIds.length > 0) {
          const insertGroupSql = 'INSERT INTO student_groups (student_id, group_id) VALUES (?, ?)';
          for (const studentId of studentIds) {
            await runQuery(insertGroupSql, [studentId, id]);
          }
        }
      }

      return { success: true };
    } catch (error) {
      console.error(`Error updating group ${id}:`, error);
      if (error.message.includes('UNIQUE constraint failed: groups.name')) {
        return { success: false, message: 'يوجد مجموعة بهذا الاسم بالفعل.' };
      }
      return { success: false, message: 'فشل في تحديث المجموعة.' };
    }
  });

  ipcMain.handle('groups:delete', async (event, id) => {
    try {
      // The ON DELETE CASCADE constraint on student_groups table will handle removing assignments.
      // No need for a separate transaction here unless more complex logic is needed.
      const query = 'DELETE FROM groups WHERE id = ?';
      await runQuery(query, [id]);
      return { success: true };
    } catch (error) {
      console.error(`Error deleting group ${id}:`, error);
      return { success: false, message: 'فشل في حذف المجموعة.' };
    }
  });

  // Student-group assignments
  ipcMain.handle('groups:getGroupStudents', async (event, groupId) => {
    try {
      const query = `
        SELECT s.*, sg.joined_at FROM students s
        JOIN student_groups sg ON s.id = sg.student_id
        WHERE sg.group_id = ?
        ORDER BY s.name ASC
      `;
      const students = await allQuery(query, [groupId]);
      return { success: true, data: students };
    } catch (error) {
      console.error(`Error fetching students for group ${groupId}:`, error);
      return { success: false, message: 'فشل في جلب الطلاب للمجموعة.' };
    }
  });

  ipcMain.handle('groups:addStudentToGroup', async (event, { studentId, groupId }) => {
    try {
      const query = 'INSERT INTO student_groups (student_id, group_id) VALUES (?, ?)';
      await runQuery(query, [studentId, groupId]);
      return { success: true };
    } catch (error) {
      // Ignore unique constraint errors, as it means the assignment already exists.
      if (!error.message.includes('UNIQUE constraint failed')) {
        console.error(`Error adding student ${studentId} to group ${groupId}:`, error);
        return { success: false, message: 'فشل في إضافة الطالب إلى المجموعة.' };
      }
      return { success: true }; // Already exists, so it's a "success"
    }
  });

  ipcMain.handle('groups:removeStudentFromGroup', async (event, { studentId, groupId }) => {
    try {
      const query = 'DELETE FROM student_groups WHERE student_id = ? AND group_id = ?';
      await runQuery(query, [studentId, groupId]);
      return { success: true };
    } catch (error) {
      console.error(`Error removing student ${studentId} from group ${groupId}:`, error);
      return { success: false, message: 'فشل في إزالة الطالب من المجموعة.' };
    }
  });

  ipcMain.handle('groups:getStudentGroups', async (event, studentId) => {
    try {
      const query = `
        SELECT g.* FROM groups g
        JOIN student_groups sg ON g.id = sg.group_id
        WHERE sg.student_id = ?
      `;
      const groups = await allQuery(query, [studentId]);
      return { success: true, data: groups };
    } catch (error) {
      console.error(`Error fetching groups for student ${studentId}:`, error);
      return { success: false, message: 'فشل في جلب مجموعات الطالب.' };
    }
  });

  ipcMain.handle('groups:getAssignmentData', async (event, groupId) => {
    try {
      const group = await getQuery('SELECT * FROM groups WHERE id = ?', [groupId]);
      if (!group) {
        return { success: false, message: 'المجموعة غير موجودة.' };
      }

      const categoryToAgeGroup = {
        'Men': { gender: 'male_only', minAge: 18 },
        'Women': { gender: 'female_only', minAge: 18 },
        'Kids': { gender: 'any', maxAge: 17 }
      };

      const criteria = categoryToAgeGroup[group.category];
      if (!criteria) {
        return { success: false, message: 'فئة المجموعة غير معروفة.' };
      }

      let sql = `
        SELECT s.id, s.name, s.matricule, s.date_of_birth, s.gender,
               CASE WHEN sg.student_id IS NOT NULL THEN 1 ELSE 0 END as isMember
        FROM students s
        LEFT JOIN student_groups sg ON s.id = sg.student_id AND sg.group_id = ?
        WHERE s.status = 'active' AND s.date_of_birth IS NOT NULL
      `;
      let params = [groupId];

      let students = await allQuery(sql, params);

      students = students.filter(student => {
        const age = calculateAge(student.date_of_birth);
        if (age === null) return false;

        // Check age criteria
        if (criteria.minAge !== undefined && age < criteria.minAge) return false;
        if (criteria.maxAge !== undefined && age > criteria.maxAge) return false;

        // Check gender criteria
        if (criteria.gender === 'male_only' && student.gender !== 'Male') return false;
        if (criteria.gender === 'female_only' && student.gender !== 'Female') return false;

        return true;
      });

      // Sort by name
      students.sort((a, b) => a.name.localeCompare(b.name));

      return { success: true, data: students };
    } catch (error) {
      console.error(`Error fetching assignment data for group ${groupId}:`, error);
      return { success: false, message: 'فشل في جلب بيانات التعيين.' };
    }
  });

  ipcMain.handle('groups:updateGroupStudents', async (event, { groupId, studentIds }) => {
    try {
      // Using a transaction to ensure atomicity
      await runQuery('BEGIN TRANSACTION;');

      // 1. Remove all existing students from the group
      await runQuery('DELETE FROM student_groups WHERE group_id = ?', [groupId]);

      // 2. Add the new list of students to the group
      if (studentIds && studentIds.length > 0) {
        const insertQuery = 'INSERT INTO student_groups (group_id, student_id) VALUES (?, ?)';
        for (const studentId of studentIds) {
          await runQuery(insertQuery, [groupId, studentId]);
        }
      }

      await runQuery('COMMIT;');
      return { success: true };
    } catch (error) {
      await runQuery('ROLLBACK;');
      console.error(`Error updating students for group ${groupId}:`, error);
      return { success: false, message: 'فشل في تحديث طلاب المجموعة.' };
    }
  });

  // Enhanced enrollment with groups
  ipcMain.handle('groups:getEligibleGroupsForClass', async (event, classId) => {
    try {
      const classData = await getQuery('SELECT * FROM classes WHERE id = ?', [classId]);
      if (!classData) {
        return { success: false, message: 'الفصل غير موجود.' };
      }

      let categoryCondition = '';
      const params = [];

      // class.gender can be 'men', 'women', 'kids', 'all'
      // group.category can be 'Men', 'Women', 'Kids'
      if (classData.gender === 'men') {
        categoryCondition = 'WHERE g.category = ?';
        params.push('Men');
      } else if (classData.gender === 'women') {
        categoryCondition = 'WHERE g.category = ?';
        params.push('Women');
      } else if (classData.gender === 'kids') {
        categoryCondition = 'WHERE g.category = ?';
        params.push('Kids');
      }
      // If classData.gender is 'all', no condition is added, so all groups are fetched.

      const query = `
        SELECT g.*,
               (SELECT COUNT(*) FROM student_groups sg WHERE sg.group_id = g.id) AS studentCount
        FROM groups g ${categoryCondition} ORDER BY g.name ASC
      `;
      const groups = await allQuery(query, params);

      return { success: true, data: groups };
    } catch (error) {
      console.error(`Error fetching eligible groups for class ${classId}:`, error);
      return { success: false, message: 'فشل في جلب المجموعات المؤهلة.' };
    }
  });

  ipcMain.handle('groups:getEligibleStudentsForGroup', async (event, groupCategory) => {
    try {
      const categoryToAgeGroup = {
        'Men': { gender: 'male_only', minAge: 18 },
        'Women': { gender: 'female_only', minAge: 18 },
        'Kids': { gender: 'any', maxAge: 17 }
      };

      const criteria = categoryToAgeGroup[groupCategory];
      if (!criteria) {
        return { success: false, message: 'فئة المجموعة غير معروفة.' };
      }

      let sql = `
        SELECT s.id, s.name, s.matricule, s.date_of_birth, s.gender
        FROM students s
        WHERE s.status = 'active' AND s.date_of_birth IS NOT NULL
      `;

      let students = await allQuery(sql);

      students = students.filter(student => {
        const age = calculateAge(student.date_of_birth);
        if (age === null) return false;

        // Check age criteria
        if (criteria.minAge !== undefined && age < criteria.minAge) return false;
        if (criteria.maxAge !== undefined && age > criteria.maxAge) return false;

        // Check gender criteria
        if (criteria.gender === 'male_only' && student.gender !== 'Male') return false;
        if (criteria.gender === 'female_only' && student.gender !== 'Female') return false;

        return true;
      });

      // Sort by name
      students.sort((a, b) => a.name.localeCompare(b.name));

      return { success: true, data: students };
    } catch (error) {
      console.error(`Error fetching students for group category ${groupCategory}:`, error);
      return { success: false, message: 'فشل في جلب الطلاب للمجموعة.' };
    }
  });
}

module.exports = { registerGroupHandlers };
