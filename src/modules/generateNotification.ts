import { Pool } from 'pg';
import { pool } from '../config/postgres';

class NotificationData {
    type?: string;
    poolClient?: Pool;
    toUserIdx: number | number[];
    gameIdx: number;
    postIdx?: number;
}

export const generateNotification = async (option: NotificationData) => {
    let notificationType = null;

    if (option.type == 'MAKE_COMMENT') notificationType = 1;
    else if (option.type == 'MODIFY_GAME') notificationType = 2;
    else if (option.type == 'DENY_GAME') notificationType = 3;
    const poolClient = option.poolClient || pool;

    poolClient.query(
        `INSERT INTO
                notification (type, user_idx, game_idx, post_idx)
            VALUES( $1, $2, $3, $4 )`,
        [notificationType, option.toUserIdx, option.gameIdx, option.postIdx || null]
    );
};

export const generateNotifications = async (option: NotificationData) => {
    (option.poolClient || pool).query(
        `INSERT INTO
                notification (type, game_idx, post_idx, user_idx)
            SELECT
                2, $1, NULL,
                UNNEST($2::int[])`,
        [option.gameIdx, option.toUserIdx]
    );
};
