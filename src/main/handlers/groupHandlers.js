const { ipcMain } = require('electron');
const {
  runQuery,
  getQuery,
  allQuery,
} = require('../../db/db');

function registerGroupHandlers() {
  // Groups Management
  ipcMain.handle('groups:get', async (event, filters = {}) => {
    try {
      let query = 'SELECT * FROM groups';
      const params = [];
      const conditions = [];

      if (filters.name) {
        conditions.push('name LIKE ?');
        params.push(`%${filters.name}%`);
      }

      if (filters.category) {
        conditions.push('category = ?');
        params.push(filters.category);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY name ASC';

      const groups = await allQuery(query, params);
      return { success: true, data: groups };
    } catch (error) {
      console.error('Error fetching groups:', error);
      return { success: false, message: 'Failed to fetch groups.' };
    }
  });

  ipcMain.handle('groups:add', async (event, groupData) => {
    try {
      const { name, description, category } = groupData;
      const query = `
        INSERT INTO groups (name, description, category)
        VALUES (?, ?, ?)
      `;
      const result = await runQuery(query, [name, description, category]);
      return { success: true, data: { id: result.id, ...groupData } };
    } catch (error) {
      console.error('Error adding group:', error);
      if (error.message.includes('UNIQUE constraint failed: groups.name')) {
        return { success: false, message: 'A group with this name already exists.' };
      }
      return { success: false, message: 'Failed to add group.' };
    }
  });

  ipcMain.handle('groups:update', async (event, id, groupData) => {
    try {
      const { name, description, category } = groupData;
      const query = `
        UPDATE groups
        SET name = ?, description = ?, category = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      await runQuery(query, [name, description, category, id]);
      return { success: true };
    } catch (error) {
      console.error(`Error updating group ${id}:`, error);
      if (error.message.includes('UNIQUE constraint failed: groups.name')) {
        return { success: false, message: 'A group with this name already exists.' };
      }
      return { success: false, message: 'Failed to update group.' };
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
      return { success: false, message: 'Failed to delete group.' };
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
      return { success: false, message: 'Failed to fetch students for group.' };
    }
  });

  ipcMain.handle('groups:addStudentToGroup', async (event, { studentId, groupId }) => {
    try {
      const query = 'INSERT INTO student_groups (student_id, group_id) VALUES (?, ?)';
      await runQuery(query, [studentId, groupId]);
      return { success: true };
    } catch (error)
    {
      // Ignore unique constraint errors, as it means the assignment already exists.
      if (!error.message.includes('UNIQUE constraint failed')) {
        console.error(`Error adding student ${studentId} to group ${groupId}:`, error);
        return { success: false, message: 'Failed to add student to group.' };
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
      return { success: false, message: 'Failed to remove student from group.' };
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
      return { success: false, message: 'Failed to fetch student groups.' };
    }
  });

  ipcMain.handle('groups:getAssignmentData', async (event, groupId) => {
    try {
      const group = await getQuery('SELECT * FROM groups WHERE id = ?', [groupId]);
      if (!group) {
        return { success: false, message: 'Group not found.' };
      }

      let sql = `
        SELECT s.id, s.name, s.matricule,
               CASE WHEN sg.student_id IS NOT NULL THEN 1 ELSE 0 END as isMember
        FROM students s
        LEFT JOIN student_groups sg ON s.id = sg.student_id AND sg.group_id = ?
        WHERE s.status = 'active'
      `;
      const params = [groupId];

      const ageThresholdSetting = await getQuery("SELECT value FROM settings WHERE key = 'adult_age_threshold'");
      const adultAgeThreshold = ageThresholdSetting ? parseInt(ageThresholdSetting.value, 10) : 18;

      const thresholdDate = new Date();
      thresholdDate.setFullYear(thresholdDate.getFullYear() - adultAgeThreshold);
      const adultOrKidBirthDate = thresholdDate.toISOString().split('T')[0];

      if (group.category === 'Men') {
        sql += ' AND s.gender = ? AND s.date_of_birth <= ?';
        params.push('Male', adultOrKidBirthDate);
      } else if (group.category === 'Women') {
        sql += ' AND s.gender = ? AND s.date_of_birth <= ?';
        params.push('Female', adultOrKidBirthDate);
      } else if (group.category === 'Kids') {
        sql += ' AND s.date_of_birth > ?';
        params.push(adultOrKidBirthDate);
      }

      sql += ' ORDER BY s.name ASC';

      const students = await allQuery(sql, params);
      return { success: true, data: students };
    } catch (error) {
      console.error(`Error fetching assignment data for group ${groupId}:`, error);
      return { success: false, message: 'Failed to fetch assignment data.' };
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
      return { success: false, message: 'Failed to update group students.' };
    }
  });

  // Enhanced enrollment with groups
  ipcMain.handle('groups:getEligibleGroupsForClass', async (event, classId) => {
    try {
      const classData = await getQuery('SELECT * FROM classes WHERE id = ?', [classId]);
      if (!classData) {
        return { success: false, message: 'Class not found.' };
      }

      let categoryCondition = '';
      const params = [];

      // class.gender can be 'men', 'women', 'kids', 'all'
      // group.category can be 'Men', 'Women', 'Kids'
      if (classData.gender === 'men') {
        categoryCondition = 'WHERE category = ?';
        params.push('Men');
      } else if (classData.gender === 'women') {
        categoryCondition = 'WHERE category = ?';
        params.push('Women');
      } else if (classData.gender === 'kids') {
        categoryCondition = 'WHERE category = ?';
        params.push('Kids');
      }
      // If classData.gender is 'all', no condition is added, so all groups are fetched.

      const query = `SELECT * FROM groups ${categoryCondition} ORDER BY name ASC`;
      const groups = await allQuery(query, params);

      return { success: true, data: groups };
    } catch (error) {
      console.error(`Error fetching eligible groups for class ${classId}:`, error);
      return { success: false, message: 'Failed to fetch eligible groups.' };
    }
  });
}

module.exports = { registerGroupHandlers };
