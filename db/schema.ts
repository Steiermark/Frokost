import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
export const registrations=sqliteTable('registrations',{id:text('id').primaryKey(),date:text('date').notNull(),name:text('name').notNull(),normalizedName:text('normalized_name').notNull(),meal:text('meal').notNull(),status:text('status').notNull().default('attending')},t=>[uniqueIndex('registrations_date_name').on(t.date,t.normalizedName)]);
export const accounts=sqliteTable('accounts',{email:text('email').primaryKey(),name:text('name').notNull(),platformId:text('platform_id').unique(),reminders:integer('reminders').notNull().default(1),role:text('role').notNull().default('employee'),passwordHash:text('password_hash').notNull().default(''),enabled:integer('enabled').notNull().default(1)});
export const tokens=sqliteTable('login_tokens',{hash:text('hash').primaryKey(),email:text('email').notNull(),created:integer('created').notNull(),expires:integer('expires').notNull()},t=>[index('login_email_created').on(t.email,t.created)]);
export const sessions=sqliteTable('sessions',{hash:text('hash').primaryKey(),email:text('email').notNull(),expires:integer('expires').notNull(),authMethod:text('auth_method').notNull().default('legacy')});
export const dishes=sqliteTable('dishes',{id:text('id').primaryKey(),date:text('date').notNull(),name:text('name').notNull(),source:text('source').notNull().default(''),photo:text('photo').notNull().default(''),photoVersion:integer('photo_version').notNull().default(0),vegetarian:integer('vegetarian').notNull().default(0),active:integer('active').notNull().default(1)},t=>[index('dishes_date').on(t.date)]);
export const reminders=sqliteTable('reminder_deliveries',{id:text('id').primaryKey(),sent:integer('sent').notNull()});



export const menus=sqliteTable('menus',{date:text('date').primaryKey(),source:text('source').notNull().default(''),released:integer('released').notNull().default(1)});


export const passwordResets=sqliteTable('password_resets',{hash:text('hash').primaryKey(),email:text('email').notNull(),expires:integer('expires').notNull()});
export const authLimits=sqliteTable('auth_limits',{key:text('key').primaryKey(),started:integer('started').notNull(),hits:integer('hits').notNull()});


export const pushSubscriptions=sqliteTable('push_subscriptions',{id:text('id').primaryKey(),email:text('email').notNull(),endpoint:text('endpoint').notNull().unique(),p256dh:text('p256dh').notNull(),auth:text('auth').notNull(),created:integer('created').notNull()},t=>[index('push_email').on(t.email)]);
export const pushDeliveries=sqliteTable('push_deliveries',{id:text('id').primaryKey(),date:text('date').notNull(),subscription:text('subscription').notNull(),status:text('status').notNull(),created:integer('created').notNull()},t=>[uniqueIndex('push_once').on(t.date,t.subscription)]);
