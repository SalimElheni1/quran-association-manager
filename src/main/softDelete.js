/**
 * @fileoverview Soft delete for records and void for money (migration 061).
 *
 * Records are never removed: deleting one sets deleted_at / deleted_by, so the payments,
 * transactions, charges and attendance that point at it stay for reports and history. Every
 * read of a soft-deletable table that feeds a list, a picker, a count or anything done from
 * now on must leave deleted rows out (`notDeleted('s')` in its WHERE clause).
 */

const db = require('../db/db');
const { toLocalISODateTime } = require('./utils/dates');

const SOFT_DELETE_TABLES = new Set([
  'students',
  'teachers',
  'classes',
  'users',
  'groups',
  'inventory_items',
  'in_kind_categories',
  'receipt_books',
]);

function assertTable(table) {
  if (!SOFT_DELETE_TABLES.has(table)) {
    throw new Error(`Soft delete is not enabled for table "${table}".`);
  }
}

/**
 * SQL condition that keeps rows which are not deleted.
 * @param {string} [alias] - Table alias used in the query, if any.
 * @returns {string}
 */
function notDeleted(alias) {
  return `${alias ? `${alias}.` : ''}deleted_at IS NULL`;
}

/**
 * SQL condition for a list that can show either the live rows or the deleted ones.
 * @param {object} [filters] - `showDeleted: true` lists the deleted rows instead.
 * @param {string} [alias]
 * @returns {string}
 */
function deletedFilter(filters, alias) {
  const column = `${alias ? `${alias}.` : ''}deleted_at`;
  return filters && filters.showDeleted ? `${column} IS NOT NULL` : `${column} IS NULL`;
}

/**
 * Marks a row deleted. Deleting an already deleted row changes nothing.
 * @param {string} table
 * @param {number} id
 * @param {number|null} userId - Who deleted it.
 * @returns {Promise<{changes: number, deletedAt: string}>}
 */
async function softDeleteRow(table, id, userId = null) {
  assertTable(table);
  const deletedAt = toLocalISODateTime();
  const result = await db.runQuery(
    `UPDATE ${table} SET deleted_at = ?, deleted_by = ? WHERE id = ? AND deleted_at IS NULL`,
    [deletedAt, userId, id],
  );
  return { changes: result.changes, deletedAt };
}

/**
 * Brings a deleted row back.
 * @param {string} table
 * @param {number} id
 * @returns {Promise<{changes: number}>}
 */
async function restoreRow(table, id) {
  assertTable(table);
  const result = await db.runQuery(
    `UPDATE ${table} SET deleted_at = NULL, deleted_by = NULL WHERE id = ? AND deleted_at IS NOT NULL`,
    [id],
  );
  return { changes: result.changes };
}

module.exports = {
  SOFT_DELETE_TABLES,
  notDeleted,
  deletedFilter,
  softDeleteRow,
  restoreRow,
};
