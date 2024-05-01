export class GameModel {
    idx: string;
    user_idx: string;
    title: string;
    title_kor: string;
    title_eng: string;
    created_at: string;

    constructor(data: GameModel) {
        this.idx = data.idx;
        this.user_idx = data.user_idx;
        this.title = data.title;
        this.title_kor = data.title_kor;
        this.title_eng = data.title_eng;
        this.created_at = data.created_at;
    }
}
