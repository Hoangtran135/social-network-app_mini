// Dữ liệu theo CHỦ ĐỀ cho các script dữ liệu mẫu: mỗi chủ đề có câu đăng bài, từ khoá ảnh (khớp nội dung) và bình luận bám sát nội dung.
// Ảnh lấy từ loremflickr.com theo từ khoá tiếng Anh nên ảnh luôn cùng chủ đề với chú thích; tham số ?lock=N giữ ảnh cố định giữa các lần xem.

export interface Topic {
  /** Từ khoá ảnh ứng với TỪNG câu trong `lines` (cùng thứ tự): ảnh của bài bám sát đúng câu chú thích. */
  lineTags: string[];
  /** Câu đăng bài về chủ đề (viết riêng cho từng chủ đề, không dùng khuôn chung). */
  lines: string[];
  /** Từ khoá tiếng Anh để tìm ảnh đúng chủ đề (mỗi ảnh chọn một từ khoá). */
  imageTags: string[];
  /** Bình luận phù hợp với nội dung bài về chủ đề này. */
  comments: string[];
}

export const TOPIC_DATA: Record<string, Topic> = {
  'du lịch': {
    lineTags: ['travel', 'sunrise', 'hotel', 'beach', 'backpacking'],
    lines: [
      'Vừa trở về sau chuyến đi 3 ngày 2 đêm, cảnh đẹp đến mức không muốn về. Ai có kế hoạch đi cuối tháng thì mình gợi ý lịch trình nhé!',
      'Săn mây từ 4 giờ sáng, lạnh run nhưng khoảnh khắc mặt trời lên thì xứng đáng từng phút.',
      'Kinh nghiệm xương máu: đi du lịch nhớ đặt phòng sớm, mùa cao điểm giá tăng gần gấp đôi.',
      'Bãi biển này vắng người và nước trong vắt, mình sẽ không tiết lộ tên đâu 😆 (đùa thôi, comment mình chỉ cho).',
      'Chuyến đi bụi đầu tiên trong năm: balo nhẹ, đôi giày cũ và một tấm bản đồ.',
    ],
    imageTags: ['travel', 'beach', 'mountain', 'landscape', 'sunset', 'backpacking'],
    comments: ['Cảnh đẹp quá, cho mình xin địa điểm với!', 'Chuyến đi này chi phí khoảng bao nhiêu bạn?', 'Đi tháng nào thì đẹp nhất vậy bạn?', 'Lịch trình bạn chia sẻ giúp mình được không?', 'Nhìn là muốn xách balo lên đi ngay 😍', 'Lần sau rủ mình đi cùng với nhé!'],
  },
  'ẩm thực': {
    lineTags: ['noodles', 'flan', 'streetfood', 'cooking', 'coffee'],
    lines: [
      'Tô phở này nước dùng ngọt thanh, bánh mềm, thịt bò tái vừa chín tới. Sáng nay no nê hạnh phúc!',
      'Thử công thức bánh flan mới, ra lò mịn không một lỗ khí. Ai cần công thức mình gửi nhé 🍮',
      'Quán nhỏ trong hẻm mà đông nghịt khách, ăn xong mới hiểu vì sao.',
      'Cuối tuần vào bếp nấu bữa tối cho cả nhà: canh chua, cá kho tộ và đĩa rau luộc.',
      'Cà phê muối ở quán này đúng chuẩn, vị mặn béo hậu ngọt, uống một lần là nhớ.',
    ],
    imageTags: ['food', 'noodles', 'coffee', 'dessert', 'cooking', 'streetfood'],
    comments: ['Nhìn ngon quá, quán này ở đâu vậy bạn?', 'Cho mình xin công thức với nhé!', 'Giá khoảng bao nhiêu một phần vậy?', 'Đói bụng rồi đây này 🤤', 'Món này mình làm hoài mà không ra được vị đó.', 'Cuối tuần mình ghé thử xem sao.'],
  },
  'công nghệ': {
    lineTags: ['ssd', 'desk', 'coding', 'smartphone', 'artificialintelligence'],
    lines: [
      'Mới nâng cấp lên SSD NVMe, thời gian khởi động giảm từ 40 giây xuống còn 8 giây. Rất đáng tiền!',
      'Chia sẻ góc làm việc mới: màn hình rộng, bàn phím cơ và một chậu cây nhỏ. Năng suất tăng thấy rõ.',
      'Tuần này mình thử viết lại một module bằng TypeScript, bắt được cả chục lỗi mà trước đó không ai phát hiện.',
      'Review nhanh chiếc điện thoại mới dùng 2 tuần: pin tốt, camera ổn, chỉ hơi nóng khi chơi game nặng.',
      'AI đang thay đổi cách mình làm việc: viết nháp, tóm tắt tài liệu, gợi ý code. Quan trọng vẫn là kiểm tra lại kết quả.',
    ],
    imageTags: ['laptop', 'computer', 'coding', 'gadget', 'technology', 'keyboard'],
    comments: ['Cấu hình này chạy mượt không bạn?', 'Bạn dùng loại bàn phím nào vậy?', 'Mình cũng đang định nâng cấp, bạn thấy đáng không?', 'Góc làm việc đẹp quá, truyền cảm hứng ghê.', 'Cho mình xin tên extension/công cụ bạn đang dùng với.', 'Review rất chi tiết, cảm ơn bạn!'],
  },
  'âm nhạc': {
    lineTags: ['concert', 'guitar', 'headphones', 'piano', 'vinyl'],
    lines: [
      'Đêm qua đi xem live show, nghe tới bài cuối cả khán phòng cùng hát theo. Nổi da gà luôn!',
      'Tập xong bản nhạc mới trên đàn guitar sau 2 tuần, ngón tay đau nhưng vui lắm 🎸',
      'Playlist cuối tuần của mình: nhạc nhẹ, tiếng mưa và một ly trà nóng.',
      'Vừa mua chiếc đàn piano cũ, âm thanh ấm đến bất ngờ. Ai biết chỗ chỉnh âm uy tín thì giới thiệu mình nhé.',
      'Tình cờ nghe lại bài hát thời cấp ba, thế là cả buổi tối ngồi nhớ về những ngày xưa.',
    ],
    imageTags: ['guitar', 'concert', 'piano', 'headphones', 'music', 'vinyl'],
    comments: ['Bài này hay thật, cho mình xin tên nhé!', 'Bạn chơi đàn lâu chưa mà hay vậy?', 'Playlist bạn có share được không?', 'Mình cũng đang tập guitar, cho mình xin kinh nghiệm với.', 'Nghe mà nổi da gà luôn 🎶', 'Lần sau có show nhớ rủ mình đi cùng.'],
  },
  'thể thao': {
    lineTags: ['running', 'football', 'gym', 'yoga', 'cycling'],
    lines: [
      'Sáng nay chạy được 10km đầu tiên, pace chưa đẹp nhưng về đích là thắng rồi 🏃',
      'Chơi bóng đá tối qua, cả đội thua 2-3 phút cuối nhưng cười không ngớt.',
      'Một tháng tập gym đều đặn: sức bền tăng, ngủ ngon hơn hẳn. Quan trọng là đừng bỏ cuộc giữa chừng.',
      'Yoga buổi sáng giúp mình dẻo dai và bình tĩnh hơn, ai mới bắt đầu thì thử bài cơ bản này nhé.',
      'Đạp xe quanh hồ lúc bình minh, không khí trong lành, quên hết áp lực công việc.',
    ],
    imageTags: ['running', 'football', 'gym', 'yoga', 'cycling', 'fitness'],
    comments: ['Giỏi quá, mình cũng muốn bắt đầu chạy bộ!', 'Bạn tập mấy buổi một tuần vậy?', 'Cho mình xin giáo án tập với.', 'Tinh thần quá tốt, cố lên bạn!', 'Cuối tuần rủ mình chạy cùng nhé.', 'Đội nào mà bạn vừa đá vậy, mình xin giao lưu.'],
  },
  'sách': {
    lineTags: ['book', 'bookshelf', 'library', 'reading', 'notebook'],
    lines: [
      'Vừa đọc xong cuốn sách này, kết thúc mở khiến mình ngồi ngẫm cả buổi tối. Rất đáng đọc!',
      'Góc đọc sách nhỏ của mình: tủ sách cũ, đèn vàng và tách trà. Cuối tuần thế này là đủ.',
      'Mục tiêu năm nay đọc 24 cuốn, mới được 9 cuốn. Ai có gợi ý sách hay xin để lại bình luận nhé.',
      'Đọc sách giấy vẫn có cái thú riêng: mùi giấy, tiếng lật trang, và cả những dòng ghi chú bên lề.',
      'Review ngắn sau khi đọc: văn phong nhẹ nhàng, nhiều trích dẫn hay, hợp để đọc lúc rảnh.',
    ],
    imageTags: ['books', 'library', 'reading', 'bookshelf', 'notebook'],
    comments: ['Cuốn này mình cũng đang định mua, hay không bạn?', 'Cho mình xin danh sách sách bạn đã đọc với.', 'Góc đọc sách đẹp quá!', 'Mình thích trích dẫn bạn ghi lại.', 'Bạn có thể gợi ý thêm cuốn nào tương tự không?', 'Sách giấy vẫn là nhất 📚'],
  },
  'phim ảnh': {
    lineTags: ['cinema', 'popcorn', 'film', 'television', 'movie'],
    lines: [
      'Tối qua xem phim này ở rạp, kịch bản chặt chẽ và nhạc nền cực đỉnh. Đừng bỏ lỡ cảnh cuối!',
      'Cuối tuần marathon cả series, ngủ lúc 3 giờ sáng mà không hối hận chút nào 🍿',
      'Review không spoil: diễn xuất tròn vai, hình ảnh đẹp, chỉ có đoạn giữa hơi chậm.',
      'Xem lại bộ phim thời thơ ấu, vẫn xúc động như lần đầu.',
      'Ai có gợi ý phim tâm lý hay để cuối tuần xem không? Mình đã xem hết list cũ rồi.',
    ],
    imageTags: ['cinema', 'movie', 'popcorn', 'film', 'theater'],
    comments: ['Phim này mình xem rồi, đúng là hay thật!', 'Không spoil giúp mình nhé 😆', 'Phim đó chiếu ở rạp nào vậy bạn?', 'Cho mình xin tên phim với.', 'Đoạn cuối làm mình khóc luôn.', 'Cuối tuần mình sẽ đi xem thử.'],
  },
  'nhiếp ảnh': {
    lineTags: ['street', 'photography', 'film', 'portrait', 'macro'],
    lines: [
      'Bộ ảnh phố sáng nay, ánh nắng xuyên qua tán cây tạo ra những vệt sáng rất đẹp. Mình chỉ chỉnh nhẹ độ tương phản.',
      'Mẹo nhỏ: chụp lúc giờ vàng (sau bình minh và trước hoàng hôn) cho màu da và cảnh vật ấm hơn hẳn.',
      'Đi dạo một vòng phố cổ với chiếc máy film cũ, chờ rửa ảnh mà hồi hộp như chờ quà.',
      'Chụp chân dung bằng ống 50mm f/1.8, xoá phông mịn mà giá lại rất mềm.',
      'Tuần này thử chụp macro: một giọt sương, một chiếc lá và cả thế giới nhỏ bé.',
    ],
    imageTags: ['photography', 'camera', 'street', 'portrait', 'macro', 'cityscape'],
    comments: ['Ảnh đẹp quá, bạn dùng máy gì vậy?', 'Màu ảnh rất có hồn, bạn chỉnh bằng preset nào?', 'Góc chụp này hay thật!', 'Cho mình xin khẩu độ và tốc độ chụp được không?', 'Mình cũng đang học chụp, ảnh này truyền cảm hứng ghê.', 'Ánh sáng đẹp thật sự 📷'],
  },
  'học tập': {
    lineTags: ['pomodoro', 'mindmap', 'laptop', 'library', 'books'],
    lines: [
      'Tuần thi cuối kỳ, mình áp dụng phương pháp Pomodoro 25 phút học – 5 phút nghỉ và hiệu quả hơn hẳn.',
      'Chia sẻ cách ghi chép bằng sơ đồ tư duy: nhớ lâu hơn và ôn bài cũng nhanh hơn nhiều.',
      'Vừa hoàn thành khoá học tiếng Anh online, mục tiêu tiếp theo là chứng chỉ IELTS 7.0.',
      'Thư viện sáng nay yên tĩnh lắm, học một mạch được 4 tiếng. Cà phê và tai nghe chống ồn là đủ.',
      'Ai có tài liệu ôn thi môn này chia sẻ mình với, cảm ơn cả nhà trước nhé!',
    ],
    imageTags: ['study', 'students', 'university', 'notebook', 'classroom'],
    comments: ['Cảm ơn bạn đã chia sẻ phương pháp, mình sẽ thử!', 'Bạn học khoá nào vậy, cho mình xin link với.', 'Cố lên bạn, thi tốt nhé!', 'Tài liệu này mình có, để mình gửi cho.', 'Mình cũng đang ôn thi đây, cùng cố gắng nào.', 'Ghi chú bằng sơ đồ tư duy hay thật 👍'],
  },
  'thú cưng': {
    lineTags: ['cat', 'dog', 'pets', 'puppy', 'kitten'],
    lines: [
      'Bé mèo nhà mình hôm nay lại leo lên bàn phím ngủ, báo hại mình gõ nhầm cả bài báo cáo 😹',
      'Dắt cún đi dạo buổi sáng, nó chạy nhảy khắp công viên và làm quen với cả đàn bạn mới.',
      'Mẹo nhỏ: tắm cho chó mèo bằng nước ấm và sữa tắm chuyên dụng để da lông không bị khô.',
      'Nhà mới có thêm thành viên bốn chân. Ai có kinh nghiệm nuôi chó con xin chỉ giáo nhé!',
      'Khoảnh khắc đáng yêu nhất ngày: bé nhà mình nằm ngửa bụng chờ được gãi.',
    ],
    imageTags: ['cat', 'dog', 'puppy', 'kitten', 'pets'],
    comments: ['Dễ thương quá trời!', 'Bé tên gì vậy bạn?', 'Bé mấy tháng rồi bạn?', 'Cho mình xin kinh nghiệm nuôi với!', 'Nhìn là muốn ôm một cái 🥰', 'Bé ăn loại hạt nào mà lông mượt vậy?'],
  },
  'game': {
    lineTags: ['esports', 'gamingpc', 'arcade', 'tournament', 'headset'],
    lines: [
      'Cuối cùng cũng leo rank thành công sau cả tuần bị đồng đội "gánh ngược". Quan trọng là giữ bình tĩnh!',
      'Mới build xong bộ PC chơi game: card đồ họa mạnh, tản nhiệt êm, chạy max setting mượt mà.',
      'Chơi lại tựa game thời cấp ba, đồ họa cũ nhưng cảm xúc thì vẫn nguyên vẹn 🎮',
      'Giải đấu nội bộ tối qua vui lắm, thua cũng cười được. Hẹn mùa sau phục thù.',
      'Ai muốn lập đội chơi cuối tuần thì nhắn mình nhé, ưu tiên người biết dùng micro.',
    ],
    imageTags: ['gaming', 'esports', 'controller', 'videogame', 'arcade'],
    comments: ['Rank gì rồi bạn ơi, lập team chơi chung nhé!', 'Cấu hình PC bạn thế nào? Cho mình xin với.', 'Game này mình cũng mê, tối nay online không?', 'Giỏi quá, chúc mừng leo rank 🔥', 'Tựa game huyền thoại luôn!', 'Mình xin vào đội với.'],
  },
  'khởi nghiệp': {
    lineTags: ['startup', 'office', 'meeting', 'money', 'mentor'],
    lines: [
      'Sau 6 tháng, startup nhỏ của mình có khách hàng trả phí đầu tiên. Cảm xúc khó tả lắm!',
      'Bài học lớn nhất năm đầu khởi nghiệp: nói chuyện với khách hàng nhiều hơn viết code.',
      'Họp nhóm sáng nay chốt xong kế hoạch quý mới. Mục tiêu rõ ràng thì ai cũng có động lực.',
      'Chia sẻ cách mình quản lý dòng tiền: tách quỹ vận hành, quỹ dự phòng và quỹ phát triển.',
      'Ai đang cần cố vấn marketing cho dự án nhỏ, mình sẵn lòng trao đổi miễn phí cuối tuần này.',
    ],
    imageTags: ['startup', 'meeting', 'office', 'business', 'teamwork'],
    comments: ['Chúc mừng bạn nhé, cố lên!', 'Cho mình xin kinh nghiệm tìm khách hàng đầu tiên với.', 'Bài học rất thực tế, cảm ơn bạn.', 'Dự án của bạn làm về lĩnh vực nào vậy?', 'Mình cũng đang khởi nghiệp, kết nối nhé!', 'Quản lý dòng tiền như vậy hay thật.'],
  },
  'làm vườn': {
    lineTags: ['herbs', 'rose', 'watering', 'succulent', 'lemon'],
    lines: [
      'Sân thượng nhà mình có thêm luống rau thơm: húng quế, ngò và tía tô. Ăn gì cũng có rau nhà trồng.',
      'Chậu hoa hồng mới nở bông đầu tiên sau 2 tháng chăm sóc, vui như được thưởng.',
      'Mẹo nhỏ: tưới cây vào sáng sớm hoặc chiều mát, tránh nắng gắt kẻo cây bị héo.',
      'Cuối tuần thay đất cho mấy chậu sen đá, rễ khoẻ là lá bóng ngay.',
      'Ai có kinh nghiệm trị sâu bệnh cho cây ăn quả không ạ? Cây chanh nhà mình bị vàng lá.',
    ],
    imageTags: ['garden', 'flowers', 'plants', 'vegetables', 'succulent'],
    comments: ['Vườn đẹp quá, mình cũng muốn trồng rau!', 'Cây này bạn tưới mấy lần một tuần vậy?', 'Cho mình xin ít hạt giống với!', 'Hoa nở đẹp thật sự 🌹', 'Lá vàng có thể do thiếu đạm, bạn thử bón thêm xem.', 'Sân thượng mà làm được vậy là siêu luôn.'],
  },
  'làm đẹp': {
    lineTags: ['skincare', 'lipstick', 'makeup', 'hairstyle', 'sunscreen'],
    lines: [
      'Routine chăm da tối giản của mình: sữa rửa mặt dịu nhẹ, dưỡng ẩm và kem chống nắng. Da cải thiện sau 1 tháng.',
      'Thử màu son mới tông cam đất, hợp với da ngăm và không bị lộ vân môi.',
      'Mẹo trang điểm đi làm trong 5 phút: kem lót, má hồng kem và chút son dưỡng.',
      'Đổi kiểu tóc mới đầu tháng, mọi người thấy có hợp với mình không? 💇',
      'Cảnh báo nhỏ: dùng kem chống nắng không đủ lượng thì như không dùng. Nhớ thoa lại sau 2-3 tiếng.',
    ],
    imageTags: ['makeup', 'skincare', 'hairstyle', 'cosmetics', 'beauty'],
    comments: ['Cho mình xin tên sản phẩm với!', 'Kiểu tóc này hợp với bạn lắm!', 'Routine này mình sẽ thử, cảm ơn bạn.', 'Màu son đẹp quá, mua ở đâu vậy?', 'Da bạn nhìn khoẻ thật 😍', 'Kem chống nắng loại nào bạn đang dùng?'],
  },
  'gia đình': {
    lineTags: ['family', 'baby', 'picnic', 'mother', 'birthday'],
    lines: [
      'Cuối tuần cả nhà về quê, bà nấu bữa cơm có đủ món mình thích. Không đâu bằng nhà!',
      'Bé nhà mình vừa biết bò, cả nhà thay phiên nhau canh vì bé lúc nào cũng muốn khám phá.',
      'Một buổi picnic nhỏ trong công viên với gia đình, giản dị mà ấm áp.',
      'Mẹ bỉm chia sẻ: bé ngủ ngon hơn từ khi mình duy trì giờ đi ngủ cố định và đèn dịu nhẹ.',
      'Sinh nhật ba tuần này, cả nhà đã chuẩn bị bất ngờ nho nhỏ mà ba vẫn đoán ra 😄',
    ],
    imageTags: ['family', 'baby', 'picnic', 'children', 'parents'],
    comments: ['Gia đình bạn hạnh phúc quá!', 'Bé đáng yêu quá trời!', 'Cho mình xin mẹo cho bé ngủ ngon với.', 'Ấm áp quá, chúc cả nhà luôn vui khoẻ!', 'Bữa cơm nhìn ngon ghê, nhớ nhà quá.', 'Chúc mừng sinh nhật bác nhé 🎂'],
  },
};

export const TOPICS = Object.keys(TOPIC_DATA);

/** Chủ đề của từng nhóm (theo tên nhóm) để bài đăng trong nhóm đúng nội dung nhóm. */
export const GROUP_TOPIC: Record<string, string> = {
  'Hội yêu du lịch': 'du lịch', 'Dân công nghệ': 'công nghệ', 'Ẩm thực Việt': 'ẩm thực', 'Nhiếp ảnh phố': 'nhiếp ảnh', 'Chạy bộ mỗi sáng': 'thể thao',
  'Đọc sách cùng nhau': 'sách', 'Lập trình React': 'công nghệ', 'Mê phim hay': 'phim ảnh', 'Thú cưng dễ thương': 'thú cưng', 'Game thủ Việt': 'game',
  'Khởi nghiệp trẻ': 'khởi nghiệp', 'Guitar & Piano': 'âm nhạc', 'Học tiếng Anh': 'học tập', 'Phượt xe máy': 'du lịch', 'Nấu ăn tại nhà': 'ẩm thực',
  'Cà phê cuối tuần': 'ẩm thực', 'Cộng đồng AI': 'công nghệ', 'Yoga mỗi ngày': 'thể thao', 'Đầu tư tài chính': 'khởi nghiệp', 'Làm vườn trên sân thượng': 'làm vườn',
  'Bóng đá phủi': 'thể thao', 'Cờ vua online': 'game', 'Vẽ & thiết kế': 'nhiếp ảnh', 'Làm đẹp tự nhiên': 'làm đẹp', 'Review sách hay': 'sách',
  'Du học sinh': 'học tập', 'Mẹ và bé': 'gia đình', 'Xe cổ & mô tô': 'du lịch', 'Âm nhạc indie': 'âm nhạc', 'Marketing số': 'khởi nghiệp',
};

/** Từ khoá ảnh của từng trang (theo tên trang). */
export const PAGE_IMAGE_TAG: Record<string, string> = {
  'Tiệm bánh Hạnh Phúc': 'bakery', 'Cà phê Góc Phố': 'coffee', 'Tin công nghệ 24h': 'technology', 'Nhà sách Trẻ': 'books', 'Phòng gym Fit+': 'gym',
  'Studio Ảnh Cưới': 'wedding', 'Quán phở Gia Truyền': 'noodles', 'Thời trang Minimal': 'fashion', 'Học viện Lập trình': 'coding', 'Du lịch Việt Xanh': 'travel',
  'Cửa hàng Hoa Tươi': 'flowers', 'Podcast Chuyện Đêm': 'microphone', 'Nhạc viện Mini': 'piano', 'Điện máy Số 1': 'appliances', 'Spa Thư Giãn': 'spa',
  'Nội thất Gỗ Ấm': 'furniture', 'Tiệm Sửa Xe Anh Ba': 'motorbike', 'Kênh Review Phim': 'cinema', 'Trường Mầm Non Hoa Mai': 'kindergarten', 'Thú Y Pet Care': 'veterinary',
};

/** Bình luận cho bài của trang (khách hàng hỏi về sản phẩm / dịch vụ). */
export const PAGE_COMMENTS = ['Bên mình có giao hàng tận nơi không ạ?', 'Cho mình xin giá và địa chỉ nhé.', 'Mình đã dùng thử, rất hài lòng!', 'Chương trình này kéo dài đến khi nào vậy ạ?', 'Chúc trang ngày càng phát triển 🎉', 'Mình sẽ ghé thử cuối tuần này.'];

/** Từ khoá ảnh theo thành phố (check-in). */
export const CITY_IMAGE_TAG: Record<string, string> = {
  'Hà Nội': 'hanoi', 'TP. Hồ Chí Minh': 'saigon', 'Đà Nẵng': 'danang', 'Hải Phòng': 'harbor', 'Cần Thơ': 'mekong', 'Huế': 'pagoda',
  'Nha Trang': 'beach', 'Đà Lạt': 'pine', 'Vũng Tàu': 'seaside', 'Hội An': 'lantern', 'Sa Pa': 'terraces', 'Phú Quốc': 'island',
};
/** Câu check-in nhắc đúng địa điểm. */
export const CHECKIN_LINES = ['Đang có mặt tại {c}, không khí hôm nay thật dễ chịu!', 'Một ngày thong thả ở {c}, chụp vài tấm làm kỷ niệm.', 'Lần đầu ghé {c}, ấn tượng hơn mình tưởng nhiều.', 'Cuối tuần trốn lên {c} nạp lại năng lượng.'];
export const CHECKIN_COMMENTS = ['Ở đó có gì ăn ngon không bạn?', 'Nhìn là muốn đến ngay!', 'Đi chơi vui nhé!', 'Chụp thêm ảnh đăng cho mọi người xem nhé.', 'Mình cũng từng đến, rất thích nơi đó.'];

/** Bình luận chung cho bài không thuộc chủ đề nào (trạng thái ngắn, trích dẫn, chia sẻ, đăng tường). KHÔNG nhắc tới ảnh vì bài có thể không có ảnh. */
export const GENERAL_COMMENTS = ['Đồng ý hoàn toàn với bạn 😄', 'Cảm ơn bạn đã chia sẻ!', 'Mình cũng đang cảm thấy y như vậy.', 'Chúc bạn một ngày thật vui!', 'Cố lên nhé, mọi chuyện sẽ ổn thôi.', 'Hay quá, mình lưu lại đọc dần.'];
/** Bình luận cho bài đăng lên tường người khác (chúc mừng, hỏi thăm). */
export const WALL_COMMENTS = ['Cảm ơn bạn nhiều nhé ❤️', 'Lâu quá không gặp, hẹn cuối tuần nhé!', 'Cảm ơn lời chúc của bạn!', 'Mình cũng nhớ bạn lắm.'];

/** URL ảnh theo từ khoá (loremflickr). `n` làm khoá cố định để mỗi ảnh khác nhau. */
export const imageUrl = (tag: string, n: number) => `https://loremflickr.com/800/600/${encodeURIComponent(tag)}?lock=${n}`;
