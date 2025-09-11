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

      if (filters.target_gender) {
        conditions.push('target_gender = ?');
        params.push(filters.target_gender);
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
      const { name, description, category, target_gender, min_age, max_age } = groupData;
      const query = `
        INSERT INTO groups (name, description, category, target_gender, min_age, max_age)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      const result = await runQuery(query, [name, description, category, target_gender, min_age, max_age]);
      return { success: true, data: { id: result.id, ...groupData } };
    } catch (error) {
      console.error('Error adding group:', error);
      // Specific check for UNIQUE constraint violation
      if (error.message.includes('UNIQUE constraint failed: groups.name')) {
        return { success: false, message: 'A group with this name already exists.' };
      }
      return { success: false, message: 'Failed to add group.' };
    }
  });

  ipcMain.handle('groups:update', async (event, id, groupData) => {
    try {
      const { name, description, category, target_gender, min_age, max_age } = groupData;
      const query = `
        UPDATE groups
        SET name = ?, description = ?, category = ?, target_gender = ?, min_age = ?, max_age = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      await runQuery(query, [name, description, category, target_gender, min_age, max_age, id]);
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

  ipcMain.handle('groups:getStudentsForGroupAssignment', async (event, groupId) => {
    try {
      // Get students who are members of the group
      const membersQuery = `
        SELECT s.* FROM students s
        JOIN student_groups sg ON s.id = sg.student_id
        WHERE sg.group_id = ?
        ORDER BY s.name ASC
      `;
      const members = await allQuery(membersQuery, [groupId]);

      // Get students who are not members of the group
      const nonMembersQuery = `
        SELECT s.* FROM students s
        WHERE s.id NOT IN (
          SELECT student_id FROM student_groups WHERE group_id = ?
        )
        ORDER BY s.name ASC
      `;
      const nonMembers = await allQuery(nonMembersQuery, [groupId]);

      return { success: true, data: { members, nonMembers } };
    } catch (error) {
      console.error(`Error fetching students for group assignment (group ${groupId}):`, error);
      return { success: false, message: 'Failed to fetch students for assignment.' };
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

      // The class gender can be 'men', 'women', 'kids', 'all'
      // The group target_gender can be 'Male', 'Female', 'All'
      let genderCondition = '';
      switch (classData.gender) {
        case 'men':
          genderCondition = "WHERE target_gender = 'Male' OR target_gender = 'All'";
          break;
        case 'women':
          genderCondition = "WHERE target_gender = 'Female' OR target_gender = 'All'";
          break;
        case 'kids':
            // Assuming kids can be of any gender, so groups for 'All' are suitable.
            // This could be refined if there were 'Kids (Male)' and 'Kids (Female)' groups.
            genderCondition = "WHERE target_gender = 'All' OR category = 'Kids'";
            break;
        case 'all':
          // No gender condition, all groups are potentially eligible
          break;
        default:
          break;
      }

      const query = `SELECT * FROM groups ${genderCondition} ORDER BY name ASC`;
      const groups = await allQuery(query);

      // Future enhancement: Add age range filtering here if class has age limits

      return { success: true, data: groups };
    } catch (error) {
      console.error(`Error fetching eligible groups for class ${classId}:`, error);
      return { success: false, message: 'Failed to fetch eligible groups.' };
    }
  });
}

module.exports = { registerGroupHandlers };
