import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const reservations=sqliteTable('reservations',{
 id:text('id').primaryKey(), scanner:integer('scanner').notNull(), start:text('start').notNull(), end:text('end').notNull(),
 rentalStart:text('rental_start').notNull(), returnDate:text('return_date').notNull(), method:text('method').notNull(), days:integer('days').notNull(), price:integer('price').notNull(),
 status:text('status').notNull(), expires:integer('expires'), owner:text('owner').notNull(), reference:text('reference').notNull().default(''), created:integer('created').notNull(),
},t=>[index('reservation_overlap').on(t.scanner,t.start,t.end),index('reservation_owner').on(t.owner,t.status)]);
