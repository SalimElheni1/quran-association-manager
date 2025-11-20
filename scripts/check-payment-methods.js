const db = require('../src/db/db');

async function checkPaymentMethods() {
  try {
    console.log('Checking payment methods in transactions table...');

    const results = await db.allQuery(`
      SELECT payment_method, COUNT(*) as count 
      FROM transactions 
      GROUP BY payment_method
    `);

    console.log('Payment Methods Distribution:');
    console.table(results);

    const invalidMethods = results.filter(
      (r) => !['CASH', 'CHECK', 'TRANSFER'].includes(r.payment_method),
    );

    if (invalidMethods.length > 0) {
      console.log('⚠️ Found invalid payment methods:', invalidMethods);
    } else {
      console.log('✅ All payment methods are valid (CASH, CHECK, TRANSFER).');
    }
  } catch (error) {
    console.error('Error checking payment methods:', error);
  }
}

checkPaymentMethods();
