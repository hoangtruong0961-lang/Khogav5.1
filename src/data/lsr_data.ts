
import { Lorebook } from "../services/ai/lorebook/types";

// LSR Table Preset v2.0.14 Data
export const LSR_PRESET: Lorebook = {
  "entries": {
    "0": {
      "key": [],
      "keysecondary": [],
      "comment": "===Hướng dẫn (Giữ ở trạng thái tắt)===",
      "content": "**Một preset bảng tăng cường trí nhớ tương đối nhẹ...**",
      "constant": true,
      "disable": true, // Disabled by default per instructions
      "order": 2000,
      "uid": 0
    },
    "1": {
      "key": [],
      "keysecondary": [],
      "comment": "Xử lý tham số",
      "content": "<%_ //Logic xử lý tham số phức tạp... _%>",
      "constant": true,
      "disable": false,
      "order": 2000,
      "uid": 1
    },
    "2": {
      "key": [],
      "keysecondary": [],
      "comment": "Tham số cấu hình",
      "content": "Set defaults...",
      "constant": true,
      "disable": false,
      "order": 2000,
      "uid": 2
    },
    "4": {
      "key": [],
      "keysecondary": [],
      "comment": "Prompt của bảng",
      "content": "<memory_table_guide>\nBảng trí nhớ định dạng CSV được lưu trong <table_stored> chứa dữ liệu...\n<table_format>\n...\n</table_format>\n</memory_table_guide>\n<table_stored>\nBảng trí nhớ hiện đang được lưu trữ mà phản hồi của bạn cần dựa vào:\n{{tableData}}\n</table_stored>",
      "constant": true,
      "disable": false,
      "order": 1000,
      "uid": 4
    },
    "6": {
      "key": [],
      "keysecondary": [],
      "comment": "Nhấn mạnh sau cùng",
      "content": "<table_rule>\n# Lưu ý về thao tác bảng\n## Cấu trúc bảng\n#0 Thông tin Hiện tại|0:Thời gian ({{getvar::tableConfigDateFormat}})|1:Điều kiện thời tiết|2:Vị trí hiện tại|3:Bầu không khí/Môi trường\n#1 Nhân vật Gần đây|0:Tên nhân vật|1:Số lượt vắng mặt|2:Mục tiêu tức thì|3:Khoảng cách vật lý|4:Tư thế/Ngôn ngữ cơ thể|5:Trạng thái tâm lý|6:Trạng thái thể chất|7:Tình trạng trang phục|8:Vật phẩm/Trang bị hiện có|9:Trạng thái đặc biệt\n#2 Thông tin Nhân vật|0:Tên nhân vật|1:Giới tính|2:Tuổi|3:Thân phận/Vai trò|4:Ngoại hình|5:Đặc điểm nhận dạng (Sẹo/Hình xăm)|6:Phong cách ăn mặc|7:Tính cách|8:Điểm mạnh/Yếu|9:Sở thích/Ghét|10:Mục tiêu dài hạn|11:Thái độ cốt lõi với <user>|12:Chi tiết quan hệ với <user>|13:Các quan hệ khác|14:Sợ hãi/Ám ảnh|15:Bí mật thầm kín|16:Ghi chú cốt truyện\n#3 Thông tin Cơ thể & Nhạy cảm|0:Tên nhân vật|1:Đặc điểm nổi bật|2:Các điểm nhạy cảm|3:Lịch sử/Lần đầu|4:Trải nghiệm/Kỹ năng|5:Sở thích tình dục|6:Phản xạ vô điều kiện|7:Ghi chú đặc biệt\n#4 Nhiệm vụ & Lịch trình|0:Tên nhiệm vụ/Sự kiện|1:Mô tả chi tiết|2:Phân loại (Chính/Phụ)|3:Tiến độ|4:Người giao|5:Người thực hiện|6:Điều kiện hoàn thành|7:Phần thưởng/Hậu quả|8:Địa điểm|9:Thời hạn|10:Ghi chú/Biến cố\n#5 Kỹ năng & Năng lực|0:Tên năng lực|1:Người/Phe sở hữu|2:Cấp độ/Sức mạnh|3:Mô tả công dụng|4:Tiêu hao/Cái giá|5:Điểm yếu/Hạn chế|6:Thời gian hồi chiêu|7:Điều kiện kích hoạt|8:Tiềm năng tiến hóa\n#6 Vật phẩm & Trang bị|0:Tên vật phẩm|1:Chủ sở hữu hiện tại|2:Độ hiếm/Cấp bậc|3:Số lượng/Tình trạng|4:Vị trí cất giữ|5:Mô tả ngoại hình|6:Công dụng/Hiệu ứng|7:Nguồn gốc|8:Hạn chế sử dụng|9:Ghi chú ẩn\n#7 Phe phái & Tổ chức|0:Tên tổ chức|1:Biểu tượng/Đặc điểm|2:Người lãnh đạo/Cơ cấu|3:Khu vực hoạt động|4:Hệ tư tưởng/Mục tiêu|5:Quy mô/Danh tiếng|6:Hoạt động nổi bật|7:Quan hệ với <user>|8:Tài nguyên/Đặc quyền|9:Ghi chú\n#8 Địa điểm & Thế giới|0:Tên địa điểm|1:Thuộc khu vực|2:Phân loại|3:Mô tả quang cảnh|4:Khí hậu/Môi trường|5:Hệ sinh thái/Cư dân|6:Khu vực quan trọng bên trong|7:Kiểm soát bởi|8:Mức độ nguy hiểm|9:Luật lệ/Quy định đặc biệt|10:Ghi chú/Tin đồn\n#9 Tổng kết Cốt truyện|0:Arc/Chương|1:Dòng thời gian|2:Tóm tắt sự kiện|3:Hậu quả|4:Manh mối chưa giải quyết\n#10 Timeline Nhân vật chính|0:Thời gian (Ngày/Tháng/Năm)|1:Độ tuổi|2:Sự kiện bước ngoặt|3:Tác động tâm lý/Thể chất|4:Nhân vật/Phe có liên quan|5:Ghi chú định hình tương lai\n#11 Chỉ dẫn Đặc biệt|0:Tên chỉ dẫn|1:Độ ưu tiên|2:Nội dung chi tiết|3:Điều kiện kích hoạt|4:Thời hạn áp dụng\n\n<format_request>\nBạn phải dựa vào các yêu cầu liên quan và nội dung của <table_stored>, hoàn thành <tableThink>, <tableEdit>...\n</format_request>",
      "constant": true,
      "disable": false,
      "order": 1000,
      "uid": 6
    }
  }
};
