// @ts-check
/// <reference path="./static/lib/@types/global.d.ts" />

const WEEKS_PER_YEAR = 48;
const NUM_YEARS = 10;
const PREDICTION_FILE_NAME = 'Optuna_LightGBM_0918_edit.csv';

class AppController extends AbstractAppController {

  //共通プロパティ
  indexToProduct = Array(AppController.PRODUCTS.length); //インデックスと商品コードの対応表
  tenYearPrediction = this.parseCSVPrediction(PREDICTION_FILE_NAME);

  yearlyPredictedDemands; //[week][商品]
  remainingFunds = 0;
  inventory;
  inventory_copy;//入庫の際に使用
  orderList;

  Point_A=['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S'];//座標を記録するためのアルファベットの配列
  Point_N=11;
  Point=[];//座標を格納した二次元配列
  
  /**
   * 各年に1度呼ばれる初期化処理。
   * @param {number} year 年数。1始まり。
   */
  init(year) {
    console.log("start year:" + year);
    //各プロパティ初期化
    this.yearlyPredictedDemands = this.getYearlyPrediction(year);
    this.remainingFunds = 5000000;
    this.inventory = new Map();
    this.inventory_copy = new Map();
    //座標を格納した二次元配列を作成
    for(var i=0; i<this.Point_N; i++) this.Point.push(Array(19));
    for(let i=1;i<this.Point_N+1;i++){
      for(let j=0;j<this.Point_A.length;j++){
        this.Point[i-1][j]=this.Point_A[j]+i;//文字列を結合
      }
    }
    //inventoryの値を全てfreeにする
    for(let i=0;i<this.Point_N;i++){
      for(let j=0;j<this.Point[i].length;j++){
        this.inventory[this.Point[i][j]]="free";
      }
    }
  }

  /**
   * 各週に1度呼ばれるアプリの処理。
   *
   * @param {number} year 年数。1始まり。
   * @param {number} week 週数。1始まり。
   * @param {DemandEntity[]} demands 今週の納品依頼情報。
   * @param {Map<string, DemandEntity[]>} prevWeekDeliveries 先週の各社の納品情報。
   */
  execute(year, week, demands, prevWeekDeliveries) {
    console.log("this is week " + week);
    // this.order([new OrderData('1001', 1, `A${week}`)]);
    // TODO 行動選択ロジック
    this.simple_weeklyaction(week, demands);
  }

  simple_weeklyaction(week, demands){
    this.recycleLogic(week);
    if(week % 3 == 1){
      this.orderLogic(week);
    }
    else if(week % 3 == 2){
      this.deliveryLogic(demands);
    }
    else{
      this.reassembleLogic();
    }
  }

  weeklyaction(year, week, demands){
    //**納品率チェック(閾値を越えたら期限切れrecycleとdeliveryを行う)
    let demandAmount = 0;
    //demandsをもとに納品指示の合計金額(demandAmount)を計算
    for(const element of demands){
      if(element.productCode == String(1001)){
        demandAmount += element.amount*3500;
      }
      if(element.productCode == String(1002)){
        demandAmount += element.amount*5000;
      }
      if(element.productCode == String(2001)){
        demandAmount += element.amount*5000;
      }
      if(element.productCode == String(2002)){
        demandAmount += element.amount*7000;
      }
      if(element.productCode == String(3001)){
        demandAmount += element.amount*50000;
      }
      if(element.productCode == String(3002)){
        demandAmount += element.amount*150000;
      }
    }
    //納品できる合計金額(deliverAmount)を計算
    let deliverAmount = 0;

    //閾値(80%)を超えるかチェック
    if(demandAmount*0.8 < deliverAmount){
      this.recycleLogic(week);
      this.deliveryLogic(demands);      
    }
    //**発注率チェック(閾値を越えたら期限切れrecycleとorderを行う)
    else{
      //発注指示の合計金額(orderAmount)を計算
      let orderAmount = 0;
      const filename = "Optuna_LightGBM_0918_edit.csv";
      let pre_demand;
      let total_week = 0;
  
      pre_demand = this.parseCSVPrediction(filename);
      total_week = (year - 1) * 48 + week - 1;
  
      for (let i = 0; i<=5; i++){
        orderAmount += pre_demand[total_week][i];
      }
      //発注できる金額(ableOrderAmount)を計算
      let ableOrderAmount = 0;
      for(const element of this.determineNumToOrder(week)){
        if(element.productCode == String(1001)){
          ableOrderAmount += element.amount*3000;
        }
        if(element.productCode == String(1002)){
          ableOrderAmount += element.amount*4000;
        }
        if(element.productCode == String(2001)){
          ableOrderAmount += element.amount*4500;
        }
        if(element.productCode == String(2002)){
          ableOrderAmount += element.amount*6000;
        }
        if(element.productCode == String(3001)){
          ableOrderAmount += element.amount*35000;
        }
        if(element.productCode == String(3002)){
          ableOrderAmount += element.amount*120000;
        }
      }
      //閾値を超えるかチェック
      if(orderAmount*0.8 < ableOrderAmount){
        this.recycleLogic(week);
        this.orderLogic(week);
      }
      //**スペース利用率チェック(閾値を下回ったら期限切れrecycleとreassembleを行う)
      else{
        //倉庫座標リストを作成
        const all_storage_id = [];
        for (let x = 0; x <= 10; x++){
          for (let y = 0; y <= 18; y++){
            all_storage_id.push([x, y]);
          }
        }
        //倉庫の座標を全探索し、free(空きスペース)かを判定する
        let space_use_count = 0;
        for (const storage_id in all_storage_id){
          const ax = this.Point[storage_id[0]][storage_id[1]];
          if (this.inventory[ax] == "free"){
            space_use_count += 1;
          }
        }
        //スペース利用率を定義
        let space_use_rate = space_use_count / (11 * 19);

        //スペース利用率が50%以下ならリサイクル+棚卸
        //より大きいければ出庫
        if (space_use_rate <= 0.5){
          this.recycleLogic(week);
          this.reassembleLogic();
        } else{
          this.recycleLogic(week);
          this.deliveryLogic(demands);
        }
      }
    }
  }

    /**
   * 需要予測ファイルのパース処理
   * @param {*} fileName
   * @returns 
   */
  parseCSVPrediction(fileName) {
    const products = AppController.PRODUCTS;//商品全体の配列
    const NUMWEEKS = WEEKS_PER_YEAR * NUM_YEARS;//480週間
    
    const predict = AppController.readTextFile(fileName);//ファイル内容を取得、各行が1週間分の需要予測
    let predictedDemands = Array.from({ length : NUMWEEKS }, () => Array(products.length).fill(0));//array[480週][6商品]
    
    // predictedDemandsのインデックスと商品コードの対応
    for (let i=0; i<products.length; i++) {
      this.indexToProduct[i] = products[i]; 
    }
    
    // CSV内容のパース
    const lines = predict.split('\n');//csvの内容を改行で分割
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();//前後の空白を削除

      if (line === '') {
        continue; //空行をスキップ
      }

      const values = line.split(',');//カンマで分割して各商品の需要予測値を取得

      //各行のデータ数が商品数と一致しない場合、エラーメッセージを出力
      if (values.length !== products.length) {
        console.error(`行 ${i + 1} のデータ数が一致しません`);
        continue;
      }
      //各値を整数に変換し、格納  
      for (let j = 0; j < values.length; j++) {
        predictedDemands[i][j] = parseInt(values[j], 10);
      }
    }

    console.log('parseCSVPrediction関数が最後まで実行されました');
    return predictedDemands;
  }
  
  /**
   * 1年分の予測を取り出す
   * @param {number} year
   * @returns 
   */
  getYearlyPrediction(year) {
    let yearlyPrediction = Array(WEEKS_PER_YEAR);
    for (let i=0; i<WEEKS_PER_YEAR; i++) {
      yearlyPrediction[i] = this.tenYearPrediction[i + WEEKS_PER_YEAR*(year-1)];
    }
    return yearlyPrediction;
  }

  // リサイクル:weekは今週の週数
  recycleLogic(week) {
    // 有効期限切れのものを格納するリスト
    const recycledata_list = [];
    let limit_week = 0;
    // 在庫の状態確認
    const stock_item_list = this.getInventryItems();
    // console.log(stock_item_list)
    // 有効期限切れの在庫と個数をリストに格納
    for (const element of stock_item_list){
      // 有効期限情報取ってくる
      const products = AppController.PRODUCTS;
      // プロダクトの商品詳細リストから同一商品コードのものを探し、有効期限を取得
      for (const element_in of products){
        if (element_in.CODE == element.productCode){
          limit_week = element_in.EXPIRE_TERM
        }
      }
      console.log(element.entryWeek)
      console.log(limit_week)
      console.log(week)
      // 有効期限が切れているならリサイクル対象のリストに追加//有効期限がないかつ(入庫週+有効週>=今週)ならリサイクル
      if (limit_week != -1){
        if (element.entryWeek + limit_week <= week){
          console.log(element.orderId, element.amount)
          recycledata_list.push(new RecycleData(element.orderId, element.amount))
        }
      }

    }
    // console.log(recycledata_list)
    // この配列は全ての在庫のうちリサイクルするべき商品を格納する
    //***リサイクルエラーチェッキング
    //【個数】個数が正の整数である事を確認
    //【注文商品ID】存在している注文IDであることを確認
    //***
    // リサイクル処理
    const recycleResults = this.recycle(recycledata_list);

    // recycleResults -> [
    //   { orderId: '000101', amount: 9, isSuccess: true },
    //   { orderId: '000201', amount: 30, isSuccess: true },
    // ]

    // successDeliveries:リサイクルが成功した商品
    const successrecycles = recycleResults.filter(result => result.isSuccess);
    // successDeliveries:リサイクルが失敗した商品
    const failrecycles = recycleResults.filter(result => !result.isSuccess);
    // 納品指示が成功した場合は在庫管理mapに反映
    for (const element of  successrecycles){
      console.log("recycle成功")
      this.reduceInventory(element.orderId,element.amount)
    }
    // TODO
    // 各商品の期限をチェック - orderList参照
    // 期限切れ発見次第捨てる
      // const recycleResults = this.recycle([
      //   new RecycleData('000101', 9),
      //   new RecycleData('000201', 30),
      // ]);
    // inventoryのアップデート　→reduceInventory()
  }

  // 発注
  orderLogic(week) {
    // TODO
    // 発注リクエスト作成（商品ID、個数、区画）
    // ① 各商品何個発注するか決める → determineNumToOrder()
    const orderDatasWithoutLocation = this.determineNumToOrder(week);
    const orderDatas = this.receive_warehouse(orderDatasWithoutLocation);
    // ② 区画決める → receiveWarehouse(input: array[#palettes] = 各パレットの個数)
    //***エラーチェッキング
    //【金額】資産と比較して超えていない事を確認
    //【個数】正の整数である事を確認
    //【商品ID】6つのどれかである事を確認
    //【区画】倉庫内に収まる、存在する区画であることを確認、すでにパレットがある区画ではないことを確認
    //***
    // 発注リクエスト送る
    //区間が指定されていないオーダーは発注しない
    for (let i = orderDatas.length - 1; i >= 0; i--) {
      if (orderDatas[i].location=="") {
          orderDatas.splice(i, 1); // 条件を満たす要素を削除
      }
    }
    const orderResults = this.order(orderDatas);
    // TODO 成功した指示データのみをinventoryに反映
    orderResults.forEach(result => {
      if (result.isSuccess) {
        // 区画取得
        const upperLeftCorner = result.location;
        const coordinates = {X:0, Y:0};
        for (let i=0; i < this.Point_N; i++) {
          for (let j=0; j < this.Point_A.length; j++) {
            if (this.Point[i][j] == upperLeftCorner) {
              coordinates.X = i;
              coordinates.Y = j;
            }
          }
        }
        // 商品コードからパレット取得
        const paletteSize = this.getPaletteSize(result.productCode);
        // パレットの区域内をForループして、値にオーダーIDを入力
        for (let i=coordinates.X; i<coordinates.X+paletteSize.X; i++) {
          for (let j=coordinates.Y; j<coordinates.Y+paletteSize.Y; j++) {
            this.inventory[this.Point[i][j]] = result.orderId;
          }
        }
      }
    });
  }


  /**
   * 商品コードから、対応するパレットのサイズを返す
   */
  getPaletteSize(productCode) {
    const products = AppController.PRODUCTS;
    const palettes = AppController.PALETTES;
    // 商品コード　→　パレットタイプ
    let productFound;
    for (const pd of products) {
      if (pd.CODE == productCode) {
        productFound = pd;
      }
    }
    // パレットタイプ →　パレットサイズ
    let paletteSize = {X:0, Y:0};
    for (const pl of palettes) {
      if (pl.TYPE == productFound?.PALETTE_TYPE) {
        paletteSize = {X:pl.SIZE.Y, Y:pl.SIZE.X};
      }
    }
    return paletteSize;
  }

  
  /**
   * 
   * @param {*} week 
   * (商品ID, 個数, 区画)
   */
  determineNumToOrder(week) {
    // 存在する商品の種類数分の要素数
    let weeklyPredictedDemands = this.yearlyPredictedDemands[Math.min(week, 47)];
    let orderDatas = [];
    // それぞれの商品に対し、必要数のオーダーリクエストを作成
    for (let i=0; i<weeklyPredictedDemands.length; i++) {
      const demandedNum = weeklyPredictedDemands[i];
      const product = this.indexToProduct[i];
      const maxNum = product.MAX_AMOUNT;
      if (product != null) {        
        let remainingProductNum = demandedNum;
        const palettesNum = Math.ceil(demandedNum*1.0/maxNum);
        for (let j=0; j<palettesNum; j++) {
          const amount = remainingProductNum>=maxNum ? maxNum : remainingProductNum;
          remainingProductNum -= amount;
          orderDatas.push(new OrderData(product.CODE, amount, ''));
        }
      }
    }
    return orderDatas;
  }

  size_get(product_CODE){
    const products = AppController.PRODUCTS;
    // プロダクトの商品詳細リストから同一商品コードのものを探し、パレットサイズを取得
    for (const element_in of products){
      if (product_CODE == element_in.CODE){//商品コードが同じ場合パレットサイズをreturn
        return element_in.PALETTE_TYPE
      }
    }
    return false;
  }

  receive_warehouse(OrderData){
    for(let i=0;i<this.Point_N;i++){
      for(let j=0;j<this.Point[i].length;j++){
        this.inventory_copy[this.Point[i][j]]=this.inventory[this.Point[i][j]];
      }
    }
    //this.inventory_copy=new Map(this.inventory);
    for(let i=0;i<OrderData.length;i++){//発注分区画を割り当てる
      division:switch(this.size_get(OrderData[i].productCode)){
        case "A"://パレットAの場合の処理
          for(let j=0;j<this.Point[0].length-1;j++){//A1から順番に割り当てる
            for(let k=0;k<this.Point_N;k++){
              if(this.inventory_copy[this.Point[k][j]]=="free" && this.inventory_copy[this.Point[k][j+1]]=="free"){
                OrderData[i].location=this.Point[k][j];
                this.inventory_copy[this.Point[k][j]]=OrderData[i].productCode;
                this.inventory_copy[this.Point[k][j+1]]=OrderData[i].productCode;
                break division;
              }
              // if(k==10 && j==4){
              //   if(this.inventory_copy[this.Point[10][6]]=="free" && this.inventory_copy[this.Point[10][7]]=="free"){
                  
              //   }
              // }
            }
          }
        case "B"://パレットBの場合の処理
          for(let j=0;j<this.Point[0].length-1;j++){
            for(let k=0;k<this.Point_N-1;k++){
              if(this.inventory_copy[this.Point[k][(j+6)%(this.Point[0].length-1)]]=="free" && this.inventory_copy[this.Point[k][(j+6)%(this.Point[0].length-1)+1]]=="free" 
                && this.inventory_copy[this.Point[k+1][(j+6)%(this.Point[0].length-1)]]=="free" && this.inventory_copy[this.Point[k+1][(j+6)%(this.Point[0].length-1)+1]]=="free"){
                OrderData[i].location=this.Point[k][(j+6)%(this.Point[0].length-1)];
                this.inventory_copy[this.Point[k][(j+6)%(this.Point[0].length-1)]]=OrderData[i].productCode;
                this.inventory_copy[this.Point[k][(j+6)%(this.Point[0].length-1)+1]]=OrderData[i].productCode;
                this.inventory_copy[this.Point[k+1][(j+6)%(this.Point[0].length-1)]]=OrderData[i].productCode;
                this.inventory_copy[this.Point[k+1][(j+6)%(this.Point[0].length-1)+1]]=OrderData[i].productCode;
                break division;
              }
            }
          }
        case "C"://パレットCの場合の処理
          for(let j=0;j<this.Point[0].length-2;j++){
            for(let k=0;k<this.Point_N-1;k++){
              if(this.inventory_copy[this.Point[k][(j+12)%(this.Point[0].length-2)]]=="free" && this.inventory_copy[this.Point[k][(j+12)%(this.Point[0].length-2)+1]]=="free" 
                && this.inventory_copy[this.Point[k+1][(j+12)%(this.Point[0].length-2)]]=="free" && this.inventory_copy[this.Point[k+1][(j+12)%(this.Point[0].length-2)+1]]=="free"
                && this.inventory_copy[this.Point[k][(j+12)%(this.Point[0].length-2)+2]]=="free" && this.inventory_copy[this.Point[k+1][(j+12)%(this.Point[0].length-2)+2]]=="free"){
                OrderData[i].location=this.Point[k][(j+12)%(this.Point[0].length-2)];
                this.inventory_copy[this.Point[k][(j+12)%(this.Point[0].length-2)]]=OrderData[i].productCode;
                this.inventory_copy[this.Point[k][(j+12)%(this.Point[0].length-2)+1]]=OrderData[i].productCode;
                this.inventory_copy[this.Point[k+1][(j+12)%(this.Point[0].length-2)]]=OrderData[i].productCode;
                this.inventory_copy[this.Point[k+1][(j+12)%(this.Point[0].length-2)+1]]=OrderData[i].productCode;
                this.inventory_copy[this.Point[k][(j+12)%(this.Point[0].length-2)+2]]=OrderData[i].productCode;
                this.inventory_copy[this.Point[k+1][(j+12)%(this.Point[0].length-2)+2]]=OrderData[i].productCode;
                break division;
              }
            }
          }
        case "D"://パレットDの場合の処理
          for(let j=0;j<this.Point[0].length-3;j++){
            for(let k=0;k<this.Point_N-2;k++){
              if(this.inventory_copy[this.Point[k][(j+15)%(this.Point[0].length-3)]]=="free" && this.inventory_copy[this.Point[k][(j+15)%(this.Point[0].length-3)+1]]=="free" 
                && this.inventory_copy[this.Point[k+1][(j+15)%(this.Point[0].length-3)]]=="free" && this.inventory_copy[this.Point[k+1][(j+15)%(this.Point[0].length-3)+1]]=="free"
                && this.inventory_copy[this.Point[k][(j+15)%(this.Point[0].length-3)+2]]=="free" && this.inventory_copy[this.Point[k+1][(j+15)%(this.Point[0].length-3)+2]]=="free"
                && this.inventory_copy[this.Point[k+2][(j+15)%(this.Point[0].length-3)]]=="free" && this.inventory_copy[this.Point[k+2][(j+15)%(this.Point[0].length-3)+1]]=="free" 
                && this.inventory_copy[this.Point[k+2][(j+15)%(this.Point[0].length-3)+2]]=="free" && this.inventory_copy[this.Point[k][(j+15)%(this.Point[0].length-3)+3]]=="free"
                && this.inventory_copy[this.Point[k+1][(j+15)%(this.Point[0].length-3)+3]]=="free" && this.inventory_copy[this.Point[k+2][(j+15)%(this.Point[0].length-3)+3]]=="free"){
                OrderData[i].location=this.Point[k][(j+15)%(this.Point[0].length-3)];
                this.inventory_copy[this.Point[k][(j+15)%(this.Point[0].length-3)]]=OrderData[i].productCode;
                this.inventory_copy[this.Point[k][(j+15)%(this.Point[0].length-3)+1]]=OrderData[i].productCode;
                this.inventory_copy[this.Point[k+1][(j+15)%(this.Point[0].length-3)]]=OrderData[i].productCode;
                this.inventory_copy[this.Point[k+1][(j+15)%(this.Point[0].length-3)+1]]=OrderData[i].productCode;
                this.inventory_copy[this.Point[k][(j+15)%(this.Point[0].length-3)+2]]=OrderData[i].productCode;
                this.inventory_copy[this.Point[k+1][(j+15)%(this.Point[0].length-3)+2]]=OrderData[i].productCode;

                this.inventory_copy[this.Point[k+2][(j+15)%(this.Point[0].length-3)]]=OrderData[i].productCode;
                this.inventory_copy[this.Point[k+2][(j+15)%(this.Point[0].length-3)+1]]=OrderData[i].productCode;
                this.inventory_copy[this.Point[k+2][(j+15)%(this.Point[0].length-3)+2]]=OrderData[i].productCode;
                this.inventory_copy[this.Point[k][(j+15)%(this.Point[0].length-3)+3]]=OrderData[i].productCode;
                this.inventory_copy[this.Point[k+1][(j+15)%(this.Point[0].length-3)+3]]=OrderData[i].productCode;
                this.inventory_copy[this.Point[k+2][(j+15)%(this.Point[0].length-3)+3]]=OrderData[i].productCode;
                break division;
              }
            }
          }
      }
    }
    return OrderData;
  }

  // 納品依頼から、出庫するものを判断
  deliveryLogic(demands){
    console.log(demands)
    const prodacutcode = [];
    const request_numToReduce = [];
    const numToReduce = [];
    const orderId = [];
    const stock_item_list = this.getInventryItems();
    console.log(stock_item_list)
    for (const element of demands){
      prodacutcode.push(element.productCode);
      request_numToReduce.push(element.amount);
    }
    console.log(prodacutcode)
    console.log(request_numToReduce)
    for (var index=0;index < prodacutcode.length;index++){
      // 商品コード別に処理を行う
      const element = prodacutcode[index]
      // console.log(element)
      // 商品コードごとに置く候補となるオーダーIDと入庫週,個数をいったんリストに格納
      let temp_item_memory_orderId = [];
      let temp_item_memory_week = [];
      let temp_item_memory_number = [];
      // 在庫の中から商品コードが同じものをリストに格納
      for (const item of stock_item_list){
        // console.log(item.productCode)
        // console.log(element)
        if (item.productCode == element){
          console.log('in')
          temp_item_memory_orderId.push(item.orderId)
          temp_item_memory_week.push(item.entryWeek)
          temp_item_memory_number.push(item.amount)
        }
      }
      // console.log(temp_item_memory_orderId)
      // console.log(temp_item_memory_week)
      // console.log(temp_item_memory_number)

      for (var i = 0;i < temp_item_memory_orderId.length ; i++){
        for (var j = temp_item_memory_orderId.length-1;j>i;j--){
          // 有効期限が小さい順にソート,これを基準にオーダーIDと有効期限も入れ替える
          if(temp_item_memory_week[j] < temp_item_memory_week[j-1]){
            var temp = temp_item_memory_week[j];
            temp_item_memory_week[j] = temp_item_memory_week[j-1];
            temp_item_memory_week[j-1] = temp;

            var temp_str = temp_item_memory_orderId[j];
            temp_item_memory_orderId[j] = temp_item_memory_orderId[j-1];
            temp_item_memory_orderId[j-1] = temp_str;

            var temp = temp_item_memory_number[j];
            temp_item_memory_number[j] = temp_item_memory_number[j-1];
            temp_item_memory_number[j-1] = temp;

          // 有効期限が一致しているなら残り個数で比較
          }else if(temp_item_memory_week[j] == temp_item_memory_week[j-1]){
            // 残り数量が少ない順に並び替える
            if (temp_item_memory_number[j]  < temp_item_memory_number[j-1]){

              var temp = temp_item_memory_week[j];
              temp_item_memory_week[j] = temp_item_memory_week[j-1];
              temp_item_memory_week[j-1] = temp;
  
              var temp_str = temp_item_memory_orderId[j];
              temp_item_memory_orderId[j] = temp_item_memory_orderId[j-1];
              temp_item_memory_orderId[j-1] = temp_str;
  
              var temp = temp_item_memory_number[j];
              temp_item_memory_number[j] = temp_item_memory_number[j-1];
              temp_item_memory_number[j-1] = temp;
            }
          }
        }
        
      }
      // console.log(temp_item_memory_orderId)
      // console.log(temp_item_memory_week)
      // console.log(temp_item_memory_number)
      // console.log(temp_item_memory_week);
      // ソート済み配列をもとに、オーダーIDと個数を指定する
      var num = request_numToReduce[index];
      // console.log(request_numToReduce)
      // console.log(request_numToReduce[index])
      for (var i = 0;i<temp_item_memory_number.length;i++){
        // オーダーIDから個数を参照し、オーダーIDの商品数が必要個数より多い場合、(全て取ってこれるのでbreak)
        console.log(temp_item_memory_orderId)
        console.log(num)
        console.log(temp_item_memory_number[i])
        // 倉庫に在庫が一つもない場合
        if (isNaN(num)){
          break;
        }
        if (temp_item_memory_orderId.length == 0){
          var nanimosinai = 0;
          console.log(temp_item_memory_orderId)
          break;
        // i番目のオーダーIDの場所に必要個数分あるとき
        }else if (num <= temp_item_memory_number[i]){
          console.log(num)
          console.log(temp_item_memory_number[i])
          orderId.push(temp_item_memory_orderId[i]);
          numToReduce.push(num);
          console.log("elseif")
          console.log(orderId)
          console.log(numToReduce)
          break;
        // i番目のオーダーIDの場所に必要個数分ないとき→パレットのすべてのやついったん全部取ってまたほかの分探しに行く
        }else{
          orderId.push(temp_item_memory_orderId[i]);
          numToReduce.push(temp_item_memory_number[i]);
          num = num - temp_item_memory_number[i];
          console.log("else")
          console.log(orderId)
          console.log(numToReduce)
        }
      }
      // console.log(orderId)
      // console.log(numToReduce)
    }

    // オーダーIDと個数を削除するめっそどに引き継ぎ
    // console.log(orderId)
    // console.log(numToReduce)
    // console.log(demands)
    // console.log(stock_item_list)
    this.execution_delivery(orderId,numToReduce);
  }
  
  inventory_Logic(){//棚卸しを行うロジック
    //在庫情報を取得
    const inventory_list=this.getInventryItems();
    console.log(inventory_list);
    //inventoryを全てfreeにする
    for(let i=0;i<this.Point_N;i++){
      for(let j=0;j<this.Point[i].length;j++){
        this.inventory[this.Point[i][j]]="free";
      }
    }
    //inventory_copyを全てfreeにする
    for(let i=0;i<this.Point_N;i++){
      for(let j=0;j<this.Point[i].length;j++){
        this.inventory_copy[this.Point[i][j]]="free";
      }
    }
    //在庫情報を取得
    let array=[];//棚卸し情報を記録する配列
    for(let i=0;i<inventory_list.length;i++){
      division:switch(this.size_get(inventory_list[i].productCode)){
        case "A"://パレットAの場合の処理
          for(let j=0;j<this.Point[0].length-1;j++){//A1から順番に割り当てる
            for(let k=0;k<this.Point_N;k++){
              if(this.inventory_copy[this.Point[k][j]]=="free" && this.inventory_copy[this.Point[k][j+1]]=="free"){
                console.log("push");
                array.push(new ReassembleData(inventory_list[i].orderId, this.Point[k][j]));//orderIDと新しい場所を記録
                this.inventory_copy[this.Point[k][j]]=1;
                this.inventory_copy[this.Point[k][j+1]]=1;//区画が埋まっていることを示す
                break division;
              }
            }
          }
        case "B"://パレットBの場合の処理
          for(let j=0;j<this.Point[0].length-1;j++){
            for(let k=0;k<this.Point_N-1;k++){
              if(this.inventory_copy[this.Point[k][(j+6)%(this.Point[0].length-1)]]=="free" && this.inventory_copy[this.Point[k][(j+6)%(this.Point[0].length-1)+1]]=="free" 
                && this.inventory_copy[this.Point[k+1][(j+6)%(this.Point[0].length-1)]]=="free" && this.inventory_copy[this.Point[k+1][(j+6)%(this.Point[0].length-1)+1]]=="free"){
                array.push(new ReassembleData(inventory_list[i].orderId, this.Point[k][(j+6)%(this.Point[0].length-1)]));//orderIDと新しい場所を記録
                this.inventory_copy[this.Point[k][(j+6)%(this.Point[0].length-1)]]=1;
                this.inventory_copy[this.Point[k][(j+6)%(this.Point[0].length-1)+1]]=1;
                this.inventory_copy[this.Point[k+1][(j+6)%(this.Point[0].length-1)]]=1;
                this.inventory_copy[this.Point[k+1][(j+6)%(this.Point[0].length-1)+1]]=1;
                break division;
              }
            }
          }
        case "C"://パレットCの場合の処理
          for(let j=0;j<this.Point[0].length-2;j++){
            for(let k=0;k<this.Point_N-1;k++){
              if(this.inventory_copy[this.Point[k][(j+12)%(this.Point[0].length-2)]]=="free" && this.inventory_copy[this.Point[k][(j+12)%(this.Point[0].length-2)+1]]=="free" 
                && this.inventory_copy[this.Point[k+1][(j+12)%(this.Point[0].length-2)]]=="free" && this.inventory_copy[this.Point[k+1][(j+12)%(this.Point[0].length-2)+1]]=="free"
                && this.inventory_copy[this.Point[k][(j+12)%(this.Point[0].length-2)+2]]=="free" && this.inventory_copy[this.Point[k+1][(j+12)%(this.Point[0].length-2)+2]]=="free"){
                array.push(new ReassembleData(inventory_list[i].orderId, this.Point[k][(j+12)%(this.Point[0].length-2)]));//orderIDと新しい場所を記録
                this.inventory_copy[this.Point[k][(j+12)%(this.Point[0].length-2)]]=1;
                this.inventory_copy[this.Point[k][(j+12)%(this.Point[0].length-2)+1]]=1;
                this.inventory_copy[this.Point[k+1][(j+12)%(this.Point[0].length-2)]]=1;
                this.inventory_copy[this.Point[k+1][(j+12)%(this.Point[0].length-2)+1]]=1;
                this.inventory_copy[this.Point[k][(j+12)%(this.Point[0].length-2)+2]]=1;
                this.inventory_copy[this.Point[k+1][(j+12)%(this.Point[0].length-2)+2]]=1;
                break division;
              }
            }
          }
        case "D"://パレットDの場合の処理
          for(let j=0;j<this.Point[0].length-3;j++){
            for(let k=0;k<this.Point_N-2;k++){
              if(this.inventory_copy[this.Point[k][(j+15)%(this.Point[0].length-3)]]=="free" && this.inventory_copy[this.Point[k][(j+15)%(this.Point[0].length-3)+1]]=="free" 
                && this.inventory_copy[this.Point[k+1][(j+15)%(this.Point[0].length-3)]]=="free" && this.inventory_copy[this.Point[k+1][(j+15)%(this.Point[0].length-3)+1]]=="free"
                && this.inventory_copy[this.Point[k][(j+15)%(this.Point[0].length-3)+2]]=="free" && this.inventory_copy[this.Point[k+1][(j+15)%(this.Point[0].length-3)+2]]=="free"
                && this.inventory_copy[this.Point[k+2][(j+15)%(this.Point[0].length-3)]]=="free" && this.inventory_copy[this.Point[k+2][(j+15)%(this.Point[0].length-3)+1]]=="free" 
                && this.inventory_copy[this.Point[k+2][(j+15)%(this.Point[0].length-3)+2]]=="free" && this.inventory_copy[this.Point[k][(j+15)%(this.Point[0].length-3)+3]]=="free"
                && this.inventory_copy[this.Point[k+1][(j+15)%(this.Point[0].length-3)+3]]=="free" && this.inventory_copy[this.Point[k+2][(j+15)%(this.Point[0].length-3)+3]]=="free"){
                array.push(new ReassembleData(inventory_list[i].orderId, this.Point[k][(j+15)%(this.Point[0].length-3)]));//orderIDと新しい場所を記録
                this.inventory_copy[this.Point[k][(j+15)%(this.Point[0].length-3)]]=1;
                this.inventory_copy[this.Point[k][(j+15)%(this.Point[0].length-3)+1]]=1;
                this.inventory_copy[this.Point[k+1][(j+15)%(this.Point[0].length-3)]]=1;
                this.inventory_copy[this.Point[k+1][(j+15)%(this.Point[0].length-3)+1]]=1;
                this.inventory_copy[this.Point[k][(j+15)%(this.Point[0].length-3)+2]]=1;
                this.inventory_copy[this.Point[k+1][(j+15)%(this.Point[0].length-3)+2]]=1;

                this.inventory_copy[this.Point[k+2][(j+15)%(this.Point[0].length-3)]]=1;
                this.inventory_copy[this.Point[k+2][(j+15)%(this.Point[0].length-3)+1]]=1;
                this.inventory_copy[this.Point[k+2][(j+15)%(this.Point[0].length-3)+2]]=1;
                this.inventory_copy[this.Point[k][(j+15)%(this.Point[0].length-3)+3]]=1;
                this.inventory_copy[this.Point[k+1][(j+15)%(this.Point[0].length-3)+3]]=1;
                this.inventory_copy[this.Point[k+2][(j+15)%(this.Point[0].length-3)+3]]=1;
                break division;
              }
            }
          }
      }
    }
    console.log("array:"+array);
    return array;
  }

  // 出庫(納品?)この出庫処理の前に、orderIDのパレットに必要個数あるか確認するやつ必要？
  // 納品書から何を何個どのorderidから納品するのか判断するやつ必要
  // パレットごと消す奴と出庫しても残ってるやつがあるのでそこをわけてやる必要あり
  // あとorderid指定するやつも渡す必要あり(有効期限の順番にorderを渡さな)
  execution_delivery(orderId, numToReduce) {
    const DeliveryData_list = [];
    for (let i = 0; i < orderId.length; i++){
      DeliveryData_list.push(new DeliveryData(orderId[i], numToReduce[i]))
    }
    console.log(DeliveryData_list)
    //***納品前にエラーチェッキング
    //【個数】在庫数、納品依頼数と比較して超えていない事を確認、正の整数である事を確認
    //【注文ID】存在している注文IDであることを確認
    //【有効期限】入庫週を取得して期限内であることを確認（商品2,4,5,6のみ）
    //***
    const deliveryResults = this.delivery(DeliveryData_list);
  // deliveryResults -> [
  //   { orderId: '000101', amount: 10, productCode: '1001', isSuccess: true },
  //   { orderId: '000201', amount: 3, productCode: '2001', isSuccess: true },
  // ]

    // successDeliveries:納品が成功した商品
    const successDeliveries = deliveryResults.filter(result => result.isSuccess);
    console.log(successDeliveries)
    // successDeliveries:納品が失敗した商品
    const failDeliveries = deliveryResults.filter(result => !result.isSuccess);
    // 納品指示が成功した場合は在庫管理mapに反映
    for (const element of  successDeliveries){
      this.reduceInventory(element.orderId,element.amount)
    }

    // TODO
    // 出庫するもの決定
    // 納品リクエスト送る
      // const deliveryResults = this.delivery([
      //   new DeliveryData('000101', 10),
      //   new DeliveryData('000201', 3),
      // ]);
    // inventoryのアップデート　→reduceInventory()
    
  }

  // 棚卸
  reassembleLogic() {
    //　TODO
    // 発注時の区画決めるメソッドと同じ？
    //***エラーチェッキング
    //【注文ID】存在している注文IDであることを確認
    //***
    // 棚卸リクエスト送る
    const reassembleResults = this.reassemble(this.inventory_Logic());
    for(let i=0;i<reassembleResults.length;i++){
      if(reassembleResults[i].isSuccess==true){
        this.inventory[String(reassembleResults[i].location)]=reassembleResults[i].orderId;
      }
    }
  }

  // 在庫減らしメソッド(パレット消去):このorderId, numToReduceはそれぞれリストじゃない
  reduceInventory(orderId, numToReduce) {
    // inventryのキーとバリューの値をリストの格納
    // 11×19=209のリスト想定
    const inventory_key_list = [];
    const inventory_value_list = [];
    const stock_item_list = this.getInventryItems();
    // 削除対象の区画を探す
    for (const [key,value] of this.inventory.entries()){
      // 削除対象なら
      if (value == orderId){
        for (const element of stock_item_list){
          // パレットを消すべきか判断。消すべきなら区画にfreeの文字を入れる
          if (element.amount == numToReduce){
            this.inventory.set(key,'free');
          }
        }
      }
    }
  }
}
AppController.registerController(AppController, 'ゆきだるま倉庫', 'teamD.svg');

