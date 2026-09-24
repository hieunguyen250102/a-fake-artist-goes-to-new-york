/**
 * Titles for when the server plays Question Master, and suggestions for a
 * human one. Easy to draw on purpose — the rulebook says an easy title
 * helps the fake, and that is the QM's side of the game.
 */

export interface Category {
  name: string;
  words: string[];
}

export const WORD_BANK: Category[] = [
  {
    name: 'Động vật',
    words: [
      'Sư tử', 'Con mèo', 'Con chó', 'Con voi', 'Hươu cao cổ', 'Con thỏ', 'Con cá', 'Con rắn', 'Con gà',
      'Con khỉ', 'Chim cánh cụt', 'Con rùa', 'Con bướm', 'Con cua', 'Con ngựa', 'Con heo', 'Bạch tuộc',
      'Cá heo', 'Ốc sên', 'Con nhện', 'Cá sấu', 'Con cú',
    ],
  },
  {
    name: 'Phương tiện',
    words: [
      'Xe đạp', 'Xe máy', 'Ô tô', 'Máy bay', 'Tàu hoả', 'Thuyền buồm', 'Trực thăng', 'Tên lửa', 'Xe buýt',
      'Xe cứu hoả', 'Tàu ngầm', 'Khinh khí cầu', 'Xích lô', 'Xe tải', 'Xe cần cẩu',
    ],
  },
  {
    name: 'Trái cây',
    words: [
      'Quả táo', 'Quả chuối', 'Dưa hấu', 'Quả dứa', 'Chùm nho', 'Quả cam', 'Dâu tây', 'Quả xoài',
      'Sầu riêng', 'Quả chanh', 'Quả lê', 'Quả anh đào', 'Thanh long', 'Quả dừa', 'Măng cụt',
    ],
  },
  {
    name: 'Món ăn',
    words: [
      'Bánh mì', 'Tô phở', 'Pizza', 'Bánh sinh nhật', 'Kem ốc quế', 'Hamburger', 'Xúc xích', 'Trứng ốp la',
      'Bánh chưng', 'Sushi', 'Bánh donut', 'Bắp rang bơ', 'Mì ly', 'Bánh xèo',
    ],
  },
  {
    name: 'Đồ vật trong nhà',
    words: [
      'Cái ghế', 'Cây đèn', 'Tivi', 'Đồng hồ', 'Cái ô', 'Cái kéo', 'Bàn chải đánh răng', 'Cái cốc', 'Cái giường',
      'Quạt điện', 'Chìa khoá', 'Cái gương', 'Tủ lạnh', 'Máy giặt', 'Bồn tắm', 'Cái nồi',
    ],
  },
  {
    name: 'Thiên nhiên',
    words: [
      'Mặt trời', 'Mặt trăng', 'Cầu vồng', 'Núi lửa', 'Đám mây', 'Cái cây', 'Bông hoa', 'Ngôi sao',
      'Tia sét', 'Thác nước', 'Sóng biển', 'Người tuyết', 'Cây xương rồng', 'Hòn đảo',
    ],
  },
  {
    name: 'Nghề nghiệp',
    words: [
      'Bác sĩ', 'Đầu bếp', 'Lính cứu hoả', 'Cảnh sát', 'Phi hành gia', 'Ca sĩ', 'Nông dân', 'Thợ lặn',
      'Hoạ sĩ', 'Ảo thuật gia', 'Phi công', 'Cướp biển', 'Thợ xây',
    ],
  },
  {
    name: 'Thể thao',
    words: [
      'Bóng đá', 'Bóng rổ', 'Bơi lội', 'Quần vợt', 'Cầu lông', 'Trượt ván', 'Đấm bốc', 'Bắn cung',
      'Lướt sóng', 'Đá cầu', 'Golf', 'Trượt tuyết',
    ],
  },
  {
    name: 'Nhạc cụ',
    words: ['Đàn guitar', 'Đàn piano', 'Cái trống', 'Kèn trumpet', 'Đàn violin', 'Cây sáo', 'Micro', 'Kèn saxophone', 'Đàn tranh'],
  },
  {
    name: 'Công trình nổi tiếng',
    words: [
      'Tháp Eiffel', 'Tượng Nữ thần Tự do', 'Kim tự tháp', 'Vạn Lý Trường Thành', 'Chùa Một Cột',
      'Tháp nghiêng Pisa', 'Cầu Vàng', 'Lâu đài', 'Cối xay gió',
    ],
  },
  {
    name: 'Quần áo & phụ kiện',
    words: ['Mũ lưỡi trai', 'Kính râm', 'Đôi giày', 'Cà vạt', 'Áo dài', 'Nón lá', 'Găng tay', 'Khăn quàng', 'Ba lô', 'Đồng hồ đeo tay'],
  },
  {
    name: 'Nhân vật',
    words: [
      'Siêu nhân', 'Người nhện', 'Tôn Ngộ Không', 'Doraemon', 'Pikachu', 'Ông già Noel', 'Nàng tiên cá',
      'Ma cà rồng', 'Người ngoài hành tinh', 'Ninja', 'Robot', 'Chú Cuội',
    ],
  },
  {
    name: 'New York',
    words: ['Taxi vàng', 'Tượng Nữ thần Tự do', 'Toà nhà chọc trời', 'Bánh bagel', 'Xe hot dog', 'Tàu điện ngầm', 'Quả táo'],
  },
];

export function pick<T>(list: T[], rng: () => number): T {
  return list[Math.floor(rng() * list.length)];
}

/** Words the bank knows for a category the QM typed, if any. */
export function wordsFor(category: string): string[] {
  const key = category.trim().toLowerCase();
  return WORD_BANK.find((c) => c.name.toLowerCase() === key)?.words ?? [];
}
