/** The rulebook, condensed, with the three roles drawn like the booklet does. */

import { Avatar, PointChip } from './Art';
import { Modal } from './Bits';

const ROLES = [
  {
    name: 'Người ra đề',
    color: 10,
    avatar: 0,
    mood: 'sly' as const,
    lines: ['Chọn chủ đề và viết tên bức tranh.', 'Không vẽ.', 'Được điểm nếu hoạ sĩ dởm thắng — nên hãy ra đề dễ!'],
  },
  {
    name: 'Hoạ sĩ dởm',
    color: 7,
    avatar: 7,
    mood: 'shock' as const,
    lines: ['Vẽ mà không biết tên tranh.', 'Được điểm nếu không bị bắt, hoặc bị bắt nhưng đoán đúng tên tranh.', 'Diễn cho giống: làm như mình biết!'],
  },
  {
    name: 'Hoạ sĩ',
    color: 11,
    avatar: 1,
    mood: 'calm' as const,
    lines: ['Mỗi lượt vẽ đúng một nét trên cùng tờ giấy.', 'Được điểm nếu chỉ ra hoạ sĩ dởm.', 'Đừng để lộ tên tranh cho hoạ sĩ dởm.'],
  },
];

export function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal className="max-w-2xl" z="z-[60]" onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="display text-2xl font-extrabold">Luật chơi</h2>
          <p className="text-sm text-ink-2">Ai đạt 5 điểm trước thì thắng — mỗi vai kiếm điểm một kiểu.</p>
        </div>
        <button type="button" onClick={onClose} className="btn btn-ghost !px-3 !py-1.5 text-sm" aria-label="Đóng">
          ✕
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {ROLES.map((r) => (
          <div key={r.name} className="rounded-2xl border-[1.5px] border-ink/10 bg-white p-3">
            <div className="flex items-center gap-2">
              <Avatar index={r.avatar} color={r.color} size={40} mood={r.mood} />
              <div className="display font-bold leading-tight">{r.name}</div>
            </div>
            <ul className="mt-2 space-y-1 text-xs leading-snug text-ink-2">
              {r.lines.map((l) => (
                <li key={l}>• {l}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <ol className="mt-4 space-y-2 text-sm leading-relaxed text-ink-2">
        <li>
          <b className="text-ink">1. Ra đề.</b> Người ra đề công bố <i>chủ đề</i> (VD: Động vật) và bí mật viết <i>tên tranh</i> (VD: Sư tử). Mỗi
          hoạ sĩ nhận một thẻ: tất cả ghi tên tranh, riêng một thẻ ghi <b className="text-rose">X</b> — người đó là hoạ sĩ dởm.
        </li>
        <li>
          <b className="text-ink">2. Vẽ.</b> Lần lượt theo chiều kim đồng hồ, mỗi người vẽ <b>một nét liền</b> (nhấc bút là hết lượt) bằng màu
          bút của mình. Cả bàn đi <b>hai vòng</b>.
        </li>
        <li>
          <b className="text-ink">3. Chỉ tay.</b> Đếm “3, 2, 1, chỉ!” — mọi hoạ sĩ (kể cả hoạ sĩ dởm) cùng lúc chỉ vào người mình nghi.
        </li>
        <li>
          <b className="text-ink">4. Lật bài.</b> Nếu hoạ sĩ dởm bị chỉ nhiều nhất (một mình), họ được đoán tên tranh <b>một lần</b>.
        </li>
      </ol>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl bg-rose-soft p-3 text-sm">
          <div className="display flex items-center gap-1.5 font-bold text-rose-deep">
            <PointChip value={2} size={20} /> Hoạ sĩ dởm & người ra đề thắng
          </div>
          <p className="mt-1 text-xs text-ink-2">
            Hoạ sĩ dởm không bị bắt (hoà phiếu cũng tính là thoát), hoặc bị bắt nhưng đoán đúng tên tranh: cả hai +2 điểm.
          </p>
        </div>
        <div className="rounded-2xl bg-cobalt-soft p-3 text-sm">
          <div className="display flex items-center gap-1.5 font-bold text-cobalt-deep">
            <PointChip value={1} size={20} /> Các hoạ sĩ thắng
          </div>
          <p className="mt-1 text-xs text-ink-2">Hoạ sĩ dởm bị bắt và đoán sai: mỗi hoạ sĩ thật +1 điểm.</p>
        </div>
      </div>

      <p className="mt-4 text-xs text-ink-3">
        Sau mỗi vòng, người ngồi bên trái người ra đề sẽ ra đề vòng sau. Chế độ “Máy ra đề” cho mọi người cùng vẽ, và chỉ hoạ sĩ dởm được điểm khi
        thắng. A Fake Artist Goes to New York do Jun Sasaki thiết kế, Oink Games phát hành — đây là bản dựng lại phi thương mại để chơi online với
        bạn bè.
      </p>
    </Modal>
  );
}
