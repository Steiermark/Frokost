import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
export const registrations=sqliteTable('registrations',{id:text('id').primaryKey(),date:text('date').notNull(),name:text('name').notNull(),normalizedName:text('normalized_name').notNull(),meal:text('meal').notNull(),status:text('status').notNull().default('attending')},t=>[uniqueIndex('registrations_date_name').on(t.date,t.normalizedName)]);
export const accounts=sqliteTable('accounts',{email:text('email').primaryKey(),name:text('name').notNull(),platformId:text('platform_id').unique(),phone:text('phone').notNull().default(''),reminders:integer('reminders').notNull().default(1),role:text('role').notNull().default('employee')});
export const tokens=sqliteTable('login_tokens',{hash:text('hash').primaryKey(),email:text('email').notNull(),created:integer('created').notNull(),expires:integer('expires').notNull()},t=>[index('login_email_created').on(t.email,t.created)]);
export const sessions=sqliteTable('sessions',{hash:text('hash').primaryKey(),email:text('email').notNull(),expires:integer('expires').notNull()});
export const dishes=sqliteTable('dishes',{id:text('id').primaryKey(),date:text('date').notNull(),name:text('name').notNull(),source:text('source').notNull().default(''),photo:text('photo').notNull().default(''),photoVersion:integer('photo_version').notNull().default(0),vegetarian:integer('vegetarian').notNull().default(0),active:integer('active').notNull().default(1)},t=>[index('dishes_date').on(t.date)]);
export const reminders=sqliteTable('reminder_deliveries',{id:text('id').primaryKey(),sent:integer('sent').notNull()});



export const menus=sqliteTable('menus',{date:text('date').primaryKey(),source:text('source').notNull().default('')});

