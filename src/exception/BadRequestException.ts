import { Exception } from './Exception';

export class BadRequestException extends Exception {
    constructor(message: string, err = null) {
        //부모가 가진 속성은 부모가 생성해준다
        //부모속성(super)을 자식속성보다 먼저 정의해준다
        super(400, message, err);
    }
}
