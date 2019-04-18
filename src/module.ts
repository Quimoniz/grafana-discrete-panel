///<reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />

import {CanvasPanelCtrl} from './canvas-metric';
import {DistinctPoints} from './distinct-points';

import _ from 'lodash';
import $ from 'jquery';
import moment from 'moment';
import kbn from 'app/core/utils/kbn';

import appEvents from 'app/core/app_events';

const grafanaColors = [
  '#7EB26D',
  '#EAB839',
  '#6ED0E0',
  '#EF843C',
  '#E24D42',
  '#1F78C1',
  '#BA43A9',
  '#705DA0',
  '#508642',
  '#CCA300',
  '#447EBC',
  '#C15C17',
  '#890F02',
  '#0A437C',
  '#6D1F62',
  '#584477',
  '#B7DBAB',
  '#F4D598',
  '#70DBED',
  '#F9BA8F',
  '#F29191',
  '#82B5D8',
  '#E5A8E2',
  '#AEA2E0',
  '#629E51',
  '#E5AC0E',
  '#64B0C8',
  '#E0752D',
  '#BF1B00',
  '#0A50A1',
  '#962D82',
  '#614D93',
  '#9AC48A',
  '#F2C96D',
  '#65C5DB',
  '#F9934E',
  '#EA6460',
  '#5195CE',
  '#D683CE',
  '#806EB7',
  '#3F6833',
  '#967302',
  '#2F575E',
  '#99440A',
  '#58140C',
  '#052B51',
  '#511749',
  '#3F2B5B',
  '#E0F9D7',
  '#FCEACA',
  '#CFFAFF',
  '#F9E2D2',
  '#FCE2DE',
  '#BADFF4',
  '#F9D9F9',
  '#DEDAF7',
]; // copied from public/app/core/utils/colors.ts because of changes in grafana 4.6.0
//(https://github.com/grafana/grafana/blob/master/PLUGIN_DEV.md)

class DiscretePanelCtrl extends CanvasPanelCtrl {
  static templateUrl = 'partials/module.html';
  static scrollable = true;

  defaults = {
    display: 'timeline', // or 'stacked'
    rowHeight: 50,
    valueMaps: [{value: 'null', op: '=', text: 'N/A'}],
    rangeMaps: [{from: 'null', to: 'null', text: 'N/A'}],
    colorMaps: [{text: 'N/A', color: '#CCC'}],
    metricNameColor: '#000000',
    valueTextColor: '#000000',
    lastValueColor: '#000000',
    timeTextColor: '#d8d9da',
    crosshairColor: '#8F070C',
    backgroundColor: 'rgba(128,128,128,0.1)',
    lineColor: 'rgba(0,0,0,0.1)',
    textSize: 24,
    textSizeTime: 12,
    extendLastValue: true,
    writeLastValue: true,
    formatMetricsProcessMonitor: false,
    writeAllValues: false,
    writeMetricNames: false,
    showTimeAxis: true,
    showLegend: true,
    showLegendNames: true,
    showLegendValues: true,
    showLegendPercent: true,
    highlightOnMouseover: true,
    expandFromQueryS: 0,
    legendSortBy: '-ms',
    units: 'short',
    defaultDuration: 10000,
    timeOptions: [
      {
        name: 'Years',
        value: 'years',
      },
      {
        name: 'Months',
        value: 'months',
      },
      {
        name: 'Weeks',
        value: 'weeks',
      },
      {
        name: 'Days',
        value: 'days',
      },
      {
        name: 'Hours',
        value: 'hours',
      },
      {
        name: 'Minutes',
        value: 'minutes',
      },
      {
        name: 'Seconds',
        value: 'seconds',
      },
      {
        name: 'Milliseconds',
        value: 'milliseconds',
      },
    ],
    timePrecision: {
      name: 'Minutes',
      value: 'minutes',
    },
    useTimePrecision: false,
  };

  annotations: any = [];
  data: DistinctPoints[] = null;
  legend: DistinctPoints[] = null;

  externalPT = false;
  isTimeline = true;
  isStacked = false;
  hoverPoint: any = null;
  colorMap: any = {};
  unitFormats: any = null; // only used for editor
  formatter: any = null;

  _colorsPaleteCash: any = null;
  _renderDimensions: any = {};
  _selectionMatrix: string[][] = [];
  showChilds: any = null;
  

  /** @ngInject */
  constructor($scope, $injector, public annotationsSrv) {
    super($scope, $injector);

    // defaults configs
    _.defaultsDeep(this.panel, this.defaults);
    this.panel.display = 'timeline'; // Only supported version now

    this.events.on('init-edit-mode', this.onInitEditMode.bind(this));
    this.events.on('render', this.onRender.bind(this));
    this.events.on('refresh', this.onRefresh.bind(this));

    this.events.on('data-received', this.onDataReceived.bind(this));
    this.events.on('data-snapshot-load', this.onDataSnapshotLoad.bind(this));
    this.events.on('data-error', this.onDataError.bind(this));
  }

  onPanelInitialized() {
    this.updateColorInfo();
    this.onConfigChanged();
  }

  onDataSnapshotLoad(snapshotData) {
    this.onDataReceived(snapshotData);
  }

  onDataError(err) {
    this.annotations = [];
    console.log('onDataError', err);
  }

  onInitEditMode() {
    this.unitFormats = kbn.getUnitFormats();

    this.addEditorTab(
      'Options',
      'public/plugins/natel-discrete-panel/partials/editor.options.html',
      1
    );
    this.addEditorTab(
      'Legend',
      'public/plugins/natel-discrete-panel/partials/editor.legend.html',
      3
    );
    this.addEditorTab(
      'Colors',
      'public/plugins/natel-discrete-panel/partials/editor.colors.html',
      4
    );
    this.addEditorTab(
      'Mappings',
      'public/plugins/natel-discrete-panel/partials/editor.mappings.html',
      5
    );
    this.editorTabIndex = 1;
    this.refresh();
  }

  onRender() {
    if (this.data == null || !this.context) {
      return;
    }

    this._updateRenderDimensions();
    this._updateSelectionMatrix();
    this._updateCanvasSize();
    this._renderRects();
    this._renderTimeAxis();
    this._renderLabels();
    this._renderAnnotations();
    this._renderSelection();
    this._renderChilds();
    this._renderCrosshair();

    this.renderingCompleted();
  }

  showLegandTooltip(pos, info) {
    let body = '<div class="graph-tooltip-time">' + info.val + '</div>';

    body += '<center>';
    if (info.count > 1) {
      body += info.count + ' times<br/>for<br/>';
    }

    body += this.formatDuration(moment.duration(info.ms));

    if (info.count > 1) {
      body += '<br/>total';
    }
    body += '</center>';

    this.$tooltip.html(body).place_tt(pos.pageX + 20, pos.pageY);
  }

  clearTT() {
    this.$tooltip.detach();
  }

  formatValue(val): string {
    if (_.isNumber(val)) {
      if (this.panel.rangeMaps) {
        for (let i = 0; i < this.panel.rangeMaps.length; i++) {
          const map = this.panel.rangeMaps[i];

          // value/number to range mapping
          const from = parseFloat(map.from);
          const to = parseFloat(map.to);
          if (to >= val && from <= val) {
            return map.text;
          }
        }
      }

      // Convert it to a string first
      if (this.formatter) {
        val = this.formatter(val, this.panel.decimals);
      }
    }

    const isNull = _.isNil(val);
    if (!isNull && !_.isString(val)) {
      val = val.toString(); // convert everything to a string
    }

    for (let i = 0; i < this.panel.valueMaps.length; i++) {
      const map = this.panel.valueMaps[i];
      // special null case
      if (map.value === 'null') {
        if (isNull) {
          return map.text;
        }
        continue;
      }

      if (val === map.value) {
        return map.text;
      }
    }

    if (isNull) {
      return 'null';
    }
    if(this.panel.formatMetricsProcessMonitor)
    {
      if(-1 < val.indexOf("."))
      {
        if(-1 < val.lastIndexOf(".4294967294"))
        {
          val = val.substring(0, val.indexOf("."));
        }
      } else {
        val = val + ".0";
      }
    }
    return val;
  }

  getColor(val) {
    if (_.has(this.colorMap, val)) {
      return this.colorMap[val];
    }
    if (this._colorsPaleteCash[val] === undefined) {
      const c = grafanaColors[this._colorsPaleteCash.length % grafanaColors.length];
      this._colorsPaleteCash[val] = c;
      this._colorsPaleteCash.length++;
    }
    return this._colorsPaleteCash[val];
  }

  randomColor() {
    const letters = 'ABCDE'.split('');
    let color = '#';
    for (let i = 0; i < 3; i++) {
      color += letters[Math.floor(Math.random() * letters.length)];
    }
    return color;
  }

  // Override the
  applyPanelTimeOverrides() {
    super.applyPanelTimeOverrides();

    if (this.panel.expandFromQueryS && this.panel.expandFromQueryS > 0) {
      const from = this.range.from.subtract(this.panel.expandFromQueryS, 's');
      this.range.from = from;
      this.range.raw.from = from;
    }
  }

  onDataReceived(dataList) {
    $(this.canvas).css('cursor', 'pointer');

    const data: DistinctPoints[] = [];
    _.forEach(dataList, metric => {
      if ('table' === metric.type) {
        if ('time' !== metric.columns[0].type) {
          throw new Error('Expected a time column from the table format');
        }
        for (let i = 1; i < metric.columns.length; i++) {
          const res = new DistinctPoints(metric.columns[i].text);
          for (let j = 0; j < metric.rows.length; j++) {
            const row = metric.rows[j];
            let pointEnd = row[0] + this.defaults.defaultDuration;
            if ( (j + 1) < metric.rows.length)
            {
              pointEnd = metric.rows[j + 1][0];
            }
            res.add(row[0], this.formatValue(row[i]), pointEnd);
          }
          res.finish(this);
          data.push(res);
        }
      }
    });
    if ( 'table' !== dataList[0].type
    && 1 < dataList.length
    && dataList[0].target.match(/ value$/)
    && dataList[1].target.match(/ end$/))
      {
        for(let j = 0; j < dataList.length; j+=2)
        {
          const res = new DistinctPoints(dataList[j].target.substring(0, dataList[j].target.length - 6));

          for(var i = 0; i < dataList[j].datapoints.length && i < dataList[j + 1].datapoints.length; ++i)
          {
            res.add(dataList[j].datapoints[i][1],
                    this.formatValue(dataList[j].datapoints[i][0]),
                    dataList[j + 1].datapoints[i][0]
            );
          }
          res.finish(this);
          data.push(res);
      }
    } else {
      _.forEach(dataList, metric => {
        const res = new DistinctPoints(metric.target);

        for(let i = 0; i < metric.datapoints.length; ++i)
        {
          res.add(metric.datapoints[i][1],
                  this.formatValue(metric.datapoints[i][0]),
                  (i + 1) < metric.datapoints.length ? metric.datapoints[i + 1][1] : (metric.datapoints[i][1] + this.defaults.defaultDuration)
                );
        }
        res.finish(this);
        data.push(res);
      });
    }
    this.data = data;
    this.updateLegendMetrics();

    // Annotations Query
    this.annotationsSrv
      .getAnnotations({
        dashboard: this.dashboard,
        panel: this.panel, // {id: 4}, //
        range: this.range,
      })
      .then(
        result => {
          this.loading = false;
          if (result.annotations && result.annotations.length > 0) {
            this.annotations = result.annotations;
          } else {
            this.annotations = null;
          }
          this.onRender();
        },
        () => {
          this.loading = false;
          this.annotations = null;
          this.onRender();
          console.log('ERRR', this);
        }
      );
  }

  updateLegendMetrics(notify?: boolean) {
    if (
      !this.data ||
      !this.panel.showLegend ||
      this.panel.showLegendNames ||
      this.data.length <= 1
    ) {
      this.legend = this.data;
    } else {
      this.legend = [DistinctPoints.combineLegend(this.data, this)];
    }

    if (notify) {
      this.onConfigChanged();
    }
  }

  removeColorMap(map) {
    const index = _.indexOf(this.panel.colorMaps, map);
    this.panel.colorMaps.splice(index, 1);
    this.updateColorInfo();
  }

  updateColorInfo() {
    const cm = {};
    for (let i = 0; i < this.panel.colorMaps.length; i++) {
      const m = this.panel.colorMaps[i];
      if (m.text) {
        cm[m.text] = m.color;
      }
    }
    this._colorsPaleteCash = {};
    this._colorsPaleteCash.length = 0;
    this.colorMap = cm;
    this.render();
  }

  addColorMap(what) {
    if (what === 'curent') {
      _.forEach(this.data, metric => {
        if (metric.legendInfo) {
          _.forEach(metric.legendInfo, info => {
            if (!_.has(this.colorMap, info.val)) {
              const v = {text: info.val, color: this.getColor(info.val)};
              this.panel.colorMaps.push(v);
              this.colorMap[info.val] = v;
            }
          });
        }
      });
    } else {
      this.panel.colorMaps.push({text: '???', color: this.randomColor()});
    }
    this.updateColorInfo();
  }

  removeValueMap(map) {
    const index = _.indexOf(this.panel.valueMaps, map);
    this.panel.valueMaps.splice(index, 1);
    this.render();
  }

  addValueMap() {
    this.panel.valueMaps.push({value: '', op: '=', text: ''});
  }

  removeRangeMap(rangeMap) {
    const index = _.indexOf(this.panel.rangeMaps, rangeMap);
    this.panel.rangeMaps.splice(index, 1);
    this.render();
  }

  addRangeMap() {
    this.panel.rangeMaps.push({from: '', to: '', text: ''});
  }

  onConfigChanged(update = false) {
    this.isTimeline = this.panel.display === 'timeline';
    this.isStacked = this.panel.display === 'stacked';

    this.formatter = null;
    if (this.panel.units && 'none' !== this.panel.units) {
      this.formatter = kbn.valueFormats[this.panel.units];
    }

    if (update) {
      this.refresh();
    } else {
      this.render();
    }
  }

  formatDuration(duration) {
    if (!this.panel.useTimePrecision) {
      return duration.humanize();
    }

    const dir: any = {};
    let hasValue = false;
    let limit = false;

    for (const o of this.panel.timeOptions) {
      dir[o.value] = parseInt(duration.as(o.value), 10);
      hasValue = dir[o.value] || hasValue;
      duration.subtract(moment.duration(dir[o.value], o.value));
      limit = this.panel.timePrecision.value === o.value || limit;

      // always show a value in case it is less than the configured
      // precision
      if (limit && hasValue) {
        break;
      }
    }

    const rs = Object.keys(dir).reduce((carry, key) => {
      const value = dir[key];
      if (!value) {
        return carry;
      }
      key = value < 2 ? key.replace(/s$/, '') : key;
      return `${carry} ${value} ${key},`;
    }, '');

    return rs.substr(0, rs.length - 1);
  }

  getLegendDisplay(info, metric) {
    let disp = info.val;
    if (
      this.panel.showLegendPercent ||
      this.panel.showLegendCounts ||
      this.panel.showLegendTime
    ) {
      disp += ' (';
      let hassomething = false;
      if (this.panel.showLegendTime) {
        disp += this.formatDuration(moment.duration(info.ms));
        hassomething = true;
      }

      if (this.panel.showLegendPercent) {
        if (hassomething) {
          disp += ', ';
        }

        let dec = this.panel.legendPercentDecimals;
        if (_.isNil(dec)) {
          if (info.per > 0.98 && metric.changes.length > 1) {
            dec = 2;
          } else if (info.per < 0.02) {
            dec = 2;
          } else {
            dec = 0;
          }
        }
        disp += kbn.valueFormats.percentunit(info.per, dec);
        hassomething = true;
      }

      if (this.panel.showLegendCounts) {
        if (hassomething) {
          disp += ', ';
        }
        disp += info.count + 'x';
      }
      disp += ')';
    }
    return disp;
  }

  //------------------
  // Mouse Events
  //------------------

  showTooltip(evt, point, isExternal) {
    let from = point.start;
    let to = point.end;
    let time = point.ms;
    let val = point.val;

    if (this.mouse.down != null) {
      from = Math.min(this.mouse.down.ts, this.mouse.position.ts);
      to = Math.max(this.mouse.down.ts, this.mouse.position.ts);
      time = to - from;
      val = 'Zoom To:';
    }

    let body = '<div class="graph-tooltip-time">' + val + '</div>';

    body += '<center>';
    body += this.dashboard.formatDate(moment(from)) + '<br/>';
    body += 'to<br/>';
    body += this.dashboard.formatDate(moment(to)) + '<br/><br/>';
    body += this.formatDuration(moment.duration(time)) + '<br/>';
    body += '</center>';

    let pageX = 0;
    let pageY = 0;
    if (isExternal) {
      const rect = this.canvas.getBoundingClientRect();
      pageY = rect.top + evt.pos.panelRelY * rect.height;
      if (pageY < 0 || pageY > $(window).innerHeight()) {
        // Skip Hidden tooltip
        this.$tooltip.detach();
        return;
      }
      pageY += $(window).scrollTop();

      const elapsed = this.range.to - this.range.from;
      const pX = (evt.pos.x - this.range.from) / elapsed;
      pageX = rect.left + pX * rect.width;
    } else {
      pageX = evt.evt.pageX;
      pageY = evt.evt.pageY;
    }

    this.$tooltip.html(body).place_tt(pageX + 20, pageY + 5);
  }

  onGraphHover(evt, showTT, isExternal) {
    this.externalPT = false;
    if (this.data && this.data.length) {
      let hover = null;
      let j = Math.floor(this.mouse.position.y / this.panel.rowHeight);
      if (j < 0) {
        j = 0;
      }
      if (j >= this.data.length) {
        j = this.data.length - 1;
      }

      if (this.isTimeline) {
        hover = this.data[j].changes[this.data[j].changes.length - 1];
        for (let i = this.data[j].changes.length - 1; i >= 0; i--) {
          if (this.data[j].changes[i].start < this.mouse.position.ts
          &&  this.data[j].changes[i].end >= this.mouse.position.ts) {
            hover = this.data[j].changes[i];
            break;
          }
        }
        this.hoverPoint = hover;

        if (this.annotations && !isExternal && this._renderDimensions) {
          if (evt.pos.y > this._renderDimensions.rowsHeight - 5) {
            const min = _.isUndefined(this.range.from) ? null : this.range.from.valueOf();
            const max = _.isUndefined(this.range.to) ? null : this.range.to.valueOf();
            const width = this._renderDimensions.width;

            const anno = _.find(this.annotations, a => {
              if (a.isRegion) {
                return evt.pos.x > a.time && evt.pos.x < a.timeEnd;
              }
              const annoX = ((a.time - min) / (max - min)) * width;
              const mouseX = evt.evt.offsetX;
              return annoX > mouseX - 5 && annoX < mouseX + 5;
            });
            if (anno) {
              console.log('TODO, hover <annotation-tooltip>', anno);
              // See: https://github.com/grafana/grafana/blob/master/public/app/plugins/panel/graph/jquery.flot.events.js#L10
              this.$tooltip
                .html(anno.text)
                .place_tt(evt.evt.pageX + 20, evt.evt.pageY + 5);
              return;
            }
          }
        }

        if (showTT && hover) {
          this.externalPT = isExternal;
          this.showTooltip(evt, hover, isExternal);
        }
        this.onRender(); // refresh the view
      } else if (!isExternal) {
        if (this.isStacked) {
          hover = this.data[j].legendInfo[0];
          // for (let i = 0; i < this.data[j].legendInfo.length; i++) {
          //   if (this.data[j].legendInfo[i].x > this.mouse.position.x) {
          //     break;
          //   }
          //   hover = this.data[j].legendInfo[i];
          // }
          this.hoverPoint = hover;
          this.onRender(); // refresh the view

          if (showTT) {
            this.externalPT = isExternal;
            this.showLegandTooltip(evt.evt, hover);
          }
        }
      }
    } else {
      this.$tooltip.detach(); // make sure it is hidden
    }
  }

  onMouseClicked(where, event) {
    if (event.metaKey === true || event.ctrlKey === true) {
      console.log('TODO? Create Annotation?', where, event);
      return;
    }

    const pt = this.hoverPoint;
    /*
    if (pt && pt.start) {
      const range = {from: moment.utc(pt.start), to: moment.utc(pt.start + pt.ms)};
      this.timeSrv.setTime(range);
      this.clear();
    }*/
    this.queryForChilds({"point": pt, "evt": event});

  }

  onMouseSelectedRange(range, event) {
    if (event.metaKey === true || event.ctrlKey === true) {
      console.log('TODO? Create range annotation?', range, event);
      return;
    }
    this.timeSrv.setTime(range);
    this.clear();
  }

  clear() {
    this.mouse.position = null;
    this.mouse.down = null;
    this.hoverPoint = null;
    $(this.canvas).css('cursor', 'wait');
    appEvents.emit('graph-hover-clear');
    this.render();
  }

  _updateRenderDimensions() {
    this._renderDimensions = {};

    const rect = (this._renderDimensions.rect = this.wrap.getBoundingClientRect());
    const rows = (this._renderDimensions.rows = this.data.length);
    const rowHeight = (this._renderDimensions.rowHeight = this.panel.rowHeight);
    const rowsHeight = (this._renderDimensions.rowsHeight = rowHeight * rows);
    const timeHeight = this.panel.showTimeAxis ? 14 + this.panel.textSizeTime : 0;
    const height = (this._renderDimensions.height = rowsHeight + timeHeight);
    const width = (this._renderDimensions.width = rect.width);
    this._renderDimensions.height = height;

    let top = 0;
    const elapsed = this.range.to - this.range.from;

    this._renderDimensions.matrix = [];
    _.forEach(this.data, metric => {
      const positions = [];

      if (this.isTimeline) {
        let point = metric.changes[0];
        for (let i = 0; i < metric.changes.length; i++) {
          point = metric.changes[i];
          if (point.start <= this.range.to) {
            const xt = Math.max(point.start - this.range.from, 0);
            const x = (xt / elapsed) * width;
            const wt = Math.max(Math.min(this.range.to, point.end) - this.range.from - xt, 0);
            const w = (wt / elapsed) * width;
            positions.push([x, w]);
          }
        }
      }

      if (this.isStacked) {
        let point = null;
        let start = this.range.from;
        for (let i = 0; i < metric.legendInfo.length; i++) {
          point = metric.legendInfo[i];
          const xt = Math.max(start - this.range.from, 0);
          const x = (xt / elapsed) * width;
          const wt = Math.max(Math.min(this.range.to, point.end) - this.range.from - xt, 0);
          const w = (wt / elapsed) * width;
          positions.push([x, w]);
          start += point.ms;
        }
      }

      this._renderDimensions.matrix.push({
        y: top,
        positions: positions,
      });

      top += rowHeight;
    });
  }

  _updateSelectionMatrix() {
    const selectionPredicates = {
      all: () => {
        return true;
      },
      crosshairHover: function(i, j) {
        return (
          this.data[i].changes[j].start <= this.mouse.position.ts &&
          this.mouse.position.ts < this.data[i].changes[j].end
        );
      },
      mouseX: function(i, j) {
        const row = this._renderDimensions.matrix[i];
        return (
          row.positions[j][0] <= this.mouse.position.x &&
          this.mouse.position.x < row.positions[j][1]
        );
      },
      metric: function(i) {
        return this.data[i] === this._selectedMetric;
      },
      legendItem: function(i, j) {
        if (this.data[i] !== this._selectedMetric) {
          return false;
        }
        return this._selectedLegendItem.val === this._getVal(i, j);
      },
    };

    function getPredicate() {
      if (this._selectedLegendItem !== undefined) {
        return 'legendItem';
      }
      if (this._selectedMetric !== undefined) {
        return 'metric';
      }
      if (this.mouse.down !== null) {
        return 'all';
      }
      if (this.panel.highlightOnMouseover && this.mouse.position != null) {
        if (this.isTimeline) {
          return 'crosshairHover';
        }
        if (this.isStacked) {
          return 'mouseX';
        }
      }
      return 'all';
    }

    const pn = getPredicate.bind(this)();
    const predicate = selectionPredicates[pn].bind(this);
    this._selectionMatrix = [];
    for (let i = 0; i < this._renderDimensions.matrix.length; i++) {
      const rs = [];
      const r = this._renderDimensions.matrix[i];
      for (let j = 0; j < r.positions.length; j++) {
        rs.push(predicate(i, j));
      }
      this._selectionMatrix.push(rs);
    }
  }

  _updateCanvasSize() {
    this.canvas.width = this._renderDimensions.width * this._devicePixelRatio;
    this.canvas.height = this._renderDimensions.height * this._devicePixelRatio;

    $(this.canvas).css('width', this._renderDimensions.width + 'px');
    $(this.canvas).css('height', this._renderDimensions.height + 'px');

    this.context.scale(this._devicePixelRatio, this._devicePixelRatio);
  }

  _getVal(metricIndex, rectIndex) {
    let point = undefined;
    if (this.isTimeline) {
      point = this.data[metricIndex].changes[rectIndex];
    }
    if (this.isStacked) {
      point = this.data[metricIndex].legendInfo[rectIndex];
    }
    if (point)
    {
      return point.val;
    } else
    {
      return "";
    }
  }

  _renderRects() {
    const matrix = this._renderDimensions.matrix;
    const ctx = this.context;

    // Clear the background
    ctx.fillStyle = this.panel.backgroundColor;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    _.forEach(this.data, (metric, i) => {
      const rowObj = matrix[i];
      for (let j = 0; j < rowObj.positions.length; j++) {
        const currentX = rowObj.positions[j][0];
        let currentWidth = rowObj.positions[j][1];
        ctx.fillStyle = this.getColor(this._getVal(i, j));
        const globalAlphaTemp = ctx.globalAlpha;
        if (!this._selectionMatrix[i][j]) {
          ctx.globalAlpha = 0.3;
        }

        ctx.fillRect(
          currentX,
          matrix[i].y,
          currentWidth,
          this._renderDimensions.rowHeight
        );
        ctx.globalAlpha = globalAlphaTemp;
      }

      if (i > 0) {
        const top = matrix[i].y;
        ctx.strokeStyle = this.panel.lineColor;
        ctx.beginPath();
        ctx.moveTo(0, top);
        ctx.lineTo(this._renderDimensions.width, top);
        ctx.stroke();
      }
    });
  }

  _renderLabels() {
    const ctx = this.context;
    ctx.lineWidth = 1;
    ctx.textBaseline = 'middle';
    ctx.font = this.panel.textSize + 'px "Open Sans", Helvetica, Arial, sans-serif';

    const offset = 2;
    const rowHeight = this._renderDimensions.rowHeight;
    _.forEach(this.data, (metric, i) => {
      const {y, positions} = this._renderDimensions.matrix[i];

      const centerY = y + rowHeight / 2;
      // let labelPositionMetricName = y + rectHeight - this.panel.textSize / 2;
      // let labelPositionLastValue = y + rectHeight - this.panel.textSize / 2;
      // let labelPositionValue = y + this.panel.textSize / 2;
      const labelPositionMetricName = centerY;
      const labelPositionLastValue = centerY;
      const labelPositionValue = centerY;

      let minTextSpot = 0;
      let maxTextSpot = this._renderDimensions.width;
      if (this.panel.writeMetricNames) {
        ctx.fillStyle = this.panel.metricNameColor;
        ctx.textAlign = 'left';
        ctx.fillText(metric.name, offset, labelPositionMetricName);
        minTextSpot = offset + ctx.measureText(metric.name).width + 2;
      }

      let hoverTextStart = -1;
      let hoverTextEnd = -1;

      if (this.mouse.position) {
        for (let j = positions.length -1; j >= 0; j--) {
          if (positions[j][0] <= this.mouse.position.x && (positions[j][0] + positions[j][1]) >= this.mouse.position.x) {
            let val = this._getVal(i, j);
            ctx.fillStyle = this.panel.valueTextColor;
            ctx.textAlign = 'left';
            hoverTextStart = positions[j][0] + offset;
            if (hoverTextStart < minTextSpot) {
              hoverTextStart = minTextSpot + 2;
              val = ': ' + val;
            }

            ctx.fillText(val, hoverTextStart, labelPositionValue);
            const txtinfo = ctx.measureText(val);
            hoverTextEnd = hoverTextStart + txtinfo.width + 4;
            break;
          }
        }
      }

      if (this.panel.writeLastValue) {
        const val = this._getVal(i, positions.length - 1);
        if(this.panel.lastValueColor)
        {
          ctx.fillStyle = this.panel.lastValueColor;
        } else
        {
          ctx.fillStyle = this.panel.valueTextColor;
        }
        ctx.textAlign = 'right';
        const txtinfo = ctx.measureText(val);
        const xval = this._renderDimensions.width - offset - txtinfo.width;
        if (xval > hoverTextEnd) {
          ctx.fillText(
            val,
            this._renderDimensions.width - offset,
            labelPositionLastValue
          );
          maxTextSpot = this._renderDimensions.width - ctx.measureText(val).width - 10;
        }
      }

      if (this.panel.writeAllValues) {
        ctx.fillStyle = this.panel.valueTextColor;
        ctx.textAlign = 'left';
        for (let j = 0; j < positions.length; j++) {
          const val = this._getVal(i, j);

          const x = positions[j][0];
          if (x > minTextSpot) {
            const width = positions[j][1];
            if (maxTextSpot > x + width) {
              // This clips the text within the given bounds
              ctx.save();
              ctx.rect(x, y, width, rowHeight);
              ctx.clip();

              ctx.fillText(val, x + offset, labelPositionValue);
              ctx.restore();
            }
          }
        }
      }
    });
  }

  _renderSelection() {
    if (this.mouse.down === null) {
      return;
    }
    if (this.mouse.position === null) {
      return;
    }
    if (!this.isTimeline) {
      return;
    }

    const ctx = this.context;
    const height = this._renderDimensions.height;

    const xmin = Math.min(this.mouse.position.x, this.mouse.down.x);
    const xmax = Math.max(this.mouse.position.x, this.mouse.down.x);

    ctx.fillStyle = 'rgba(110, 110, 110, 0.5)';
    ctx.strokeStyle = 'rgba(110, 110, 110, 0.5)';
    ctx.beginPath();
    ctx.fillRect(xmin, 0, xmax - xmin, height);
    ctx.strokeRect(xmin, 0, xmax - xmin, height);
  }

  _renderTimeAxis() {
    if (!this.panel.showTimeAxis) {
      return;
    }

    const ctx = this.context;
    // const rows = this.data.length;
    // const rowHeight = this.panel.rowHeight;
    // const height = this._renderDimensions.height;
    const width = this._renderDimensions.width;
    const top = this._renderDimensions.rowsHeight;

    const headerColumnIndent = 0; // header inset (zero for now)

    ctx.font = this.panel.textSizeTime + 'px "Open Sans", Helvetica, Arial, sans-serif';
    ctx.fillStyle = this.panel.timeTextColor;
    ctx.textAlign = 'left';
    ctx.strokeStyle = this.panel.timeTextColor;
    ctx.textBaseline = 'top';
    ctx.setLineDash([7, 5]); // dashes are 5px and spaces are 3px
    ctx.lineDashOffset = 0;

    const min = _.isUndefined(this.range.from) ? null : this.range.from.valueOf();
    const max = _.isUndefined(this.range.to) ? null : this.range.to.valueOf();
    const minPxInterval = ctx.measureText('12/33 24:59').width * 2;
    const estNumTicks = width / minPxInterval;
    const estTimeInterval = (max - min) / estNumTicks;
    const timeResolution = this.getTimeResolution(estTimeInterval);
    const pixelStep = (timeResolution / (max - min)) * width;
    let nextPointInTime = this.roundDate(min, timeResolution) + timeResolution;
    let xPos = headerColumnIndent + ((nextPointInTime - min) / (max - min)) * width;

    const timeFormat = this.time_format(max - min, timeResolution / 1000);
    let displayOffset = 0;
    if (this.dashboard.timezone === 'utc') {
      displayOffset = new Date().getTimezoneOffset() * 60000;
    }

    while (nextPointInTime < max) {
      // draw ticks
      ctx.beginPath();
      ctx.moveTo(xPos, top + 5);
      ctx.lineTo(xPos, 0);
      ctx.lineWidth = 1;
      ctx.stroke();

      // draw time label
      const date = new Date(nextPointInTime + displayOffset);
      const dateStr = this.formatDate(date, timeFormat);
      const xOffset = ctx.measureText(dateStr).width / 2;
      ctx.fillText(dateStr, xPos - xOffset, top + 10);

      nextPointInTime += timeResolution;
      xPos += pixelStep;
    }
  }

  _renderCrosshair() {
    if (this.mouse.down != null) {
      return;
    }
    if (this.mouse.position === null) {
      return;
    }
    if (!this.isTimeline) {
      return;
    }

    const ctx = this.context;
    const rows = this.data.length;
    //let rowHeight = this.panel.rowHeight;
    const height = this._renderDimensions.height;

    ctx.beginPath();
    ctx.moveTo(this.mouse.position.x, 0);
    ctx.lineTo(this.mouse.position.x, height);
    ctx.strokeStyle = this.panel.crosshairColor;
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw a Circle around the point if showing a tooltip
    if (this.externalPT && rows > 1) {
      ctx.beginPath();
      ctx.arc(this.mouse.position.x, this.mouse.position.y, 3, 0, 2 * Math.PI, false);
      ctx.fillStyle = this.panel.crosshairColor;
      ctx.fill();
      ctx.lineWidth = 1;
    }
  }

  _renderAnnotations() {
    if (!this.panel.showTimeAxis) {
      return;
    }
    if (!this.annotations) {
      return;
    }

    const ctx = this.context;
    //const rows = this.data.length;
    const rowHeight = this.panel.rowHeight;
    //const height = this._renderDimensions.height;
    const width = this._renderDimensions.width;
    const top = this._renderDimensions.rowsHeight;

    const headerColumnIndent = 0; // header inset (zero for now)
    ctx.font = this.panel.textSizeTime + 'px "Open Sans", Helvetica, Arial, sans-serif';
    ctx.fillStyle = '#7FE9FF';
    ctx.textAlign = 'left';
    ctx.strokeStyle = '#7FE9FF';

    ctx.textBaseline = 'top';
    ctx.setLineDash([3, 3]);
    ctx.lineDashOffset = 0;
    ctx.lineWidth = 2;

    const min = _.isUndefined(this.range.from) ? null : this.range.from.valueOf();
    const max = _.isUndefined(this.range.to) ? null : this.range.to.valueOf();
    //let xPos = headerColumnIndent;

    _.forEach(this.annotations, anno => {
      ctx.setLineDash([3, 3]);

      let isAlert = false;
      if (anno.source.iconColor) {
        ctx.fillStyle = anno.source.iconColor;
        ctx.strokeStyle = anno.source.iconColor;
      } else if (anno.annotation === undefined) {
        // grafana annotation
        ctx.fillStyle = '#7FE9FF';
        ctx.strokeStyle = '#7FE9FF';
      } else {
        isAlert = true;
        ctx.fillStyle = '#EA0F3B'; //red
        ctx.strokeStyle = '#EA0F3B';
      }

      this._drawVertical(
        ctx,
        anno.time,
        min,
        max,
        headerColumnIndent,
        top,
        width,
        isAlert
      );

      //do the TO rangeMap
      if (anno.isRegion) {
        this._drawVertical(
          ctx,
          anno.timeEnd,
          min,
          max,
          headerColumnIndent,
          top,
          width,
          isAlert
        );

        //draw horizontal line at bottom
        const xPosStart = headerColumnIndent + ((anno.time - min) / (max - min)) * width;
        const xPosEnd = headerColumnIndent + ((anno.timeEnd - min) / (max - min)) * width;

        // draw ticks
        ctx.beginPath();
        ctx.moveTo(xPosStart, top + 5);
        ctx.lineTo(xPosEnd, top + 5);

        ctx.lineWidth = 4;
        ctx.setLineDash([]);
        ctx.stroke();
        //end horizontal
        //do transparency
        if (isAlert === false) {
          ctx.save();
          ctx.fillStyle = '#7FE9FF';
          ctx.globalAlpha = 0.2;
          ctx.fillRect(xPosStart, 0, xPosEnd - xPosStart, rowHeight);
          ctx.stroke();
          ctx.restore();
        }
      }
    });
  }

  _drawVertical(ctx, timeVal, min, max, headerColumnIndent, top, width, isAlert) {
    const xPos = headerColumnIndent + ((timeVal - min) / (max - min)) * width;

    // draw ticks
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xPos, top + 5);
    ctx.lineTo(xPos, 0);
    ctx.stroke();

    // draw triangle
    ctx.moveTo(xPos + 0, top);
    ctx.lineTo(xPos - 5, top + 7);
    ctx.lineTo(xPos + 5, top + 7);
    ctx.fill();

    // draw alert label
    if (isAlert === true) {
      const dateStr = '\u25B2';
      const xOffset = ctx.measureText(dateStr).width / 2;
      ctx.fillText(dateStr, xPos - xOffset, top + 10);
    }
  }
  _renderChilds() {
    if(!this.showChilds)
    {
      return;
    }
    const ctx = this.context;

    const locationPos = [0, 0, 0, 0];
    let drawDirection = 1;
    try {
      if((this.showChilds.i + 4) > this._renderDimensions.matrix.length)
      {
        drawDirection = -1;
      }
      locationPos[0] = this._renderDimensions.matrix[this.showChilds.i].positions[this.showChilds.j][0];
      locationPos[1] = this._renderDimensions.matrix[this.showChilds.i].y + this.panel.rowHeight * drawDirection;
      locationPos[2] = this._renderDimensions.matrix[this.showChilds.i].positions[this.showChilds.j][1];
      locationPos[3] = this.panel.rowHeight;
    } catch(exc)
    {
      return;
    }
    ctx.textAlign = 'left';

    this._drawTextWithBackground(this.basename(this.showChilds.filename), locationPos);
    if(this.showChilds.childs)
    {
      const drawStack = new Array();
      let indexDepth = 0;
      let yOffset = locationPos[1];
      drawStack.push(new Array());
      for(let i = 0; i < this.showChilds.childs.length; ++i)
      {
        drawStack[0].push(this.showChilds.childs[i]);
      }
      const canvasWidth = this.wrap.getBoundingClientRect().width;
      const timeStretch = this.range.to - this.range.from;
      const heightPerRow = this.panel.rowHeight;
      while(0 <= indexDepth)
      {
        let curElement;
        if(0 < drawStack[indexDepth].length)
        {
          curElement = drawStack[indexDepth].shift();
          if((curElement.end/1000000) > this.range.from
          && (curElement.start/1000000) < this.range.to)
          {
            const targetX = Math.floor((Math.max(this.range.from, curElement.start / 1000000) - this.range.from) * canvasWidth / timeStretch);
            const targetWidth = Math.floor((Math.min(this.range.to, curElement.end / 1000000) - Math.max(this.range.from, curElement.start / 1000000)) * canvasWidth / timeStretch);
            this._drawTextWithBackground(this.basename(curElement.filename), [targetX, yOffset + heightPerRow * (indexDepth + 1) * drawDirection, targetWidth, heightPerRow]);
          }
        }
        if(curElement)
        {
          if(curElement.childs)
          {
            drawStack.push(new Array());
            ++indexDepth;
            for(let i = 0; i < curElement.childs.length; ++i)
            {
              drawStack[indexDepth].push(curElement.childs[i]);
            }
          }
        } else
        {
          --indexDepth;
          drawStack.pop();
        }
      }
    }
  }
  _drawTextWithBackground(text, dimensions)
  {
    //clipping so the font will not wrap outside of our clipping box
    this.context.save();
    this.context.beginPath();
    this.context.moveTo(dimensions[0], dimensions[1]);
    this.context.lineTo(dimensions[0] + dimensions[2], dimensions[1]);
    this.context.lineTo(dimensions[0] + dimensions[2], dimensions[1] + dimensions[3]);
    this.context.lineTo(dimensions[0], dimensions[1] + dimensions[3]);
    this.context.closePath();
    this.context.clip();

    this.context.fillStyle = "#ffffff";
    this.context.fillRect(dimensions[0], dimensions[1], dimensions[2], dimensions[3]);

    this.context.strokeStyle = "#000000";
    this.context.fillStyle = "#000000";
    this.context.setLineDash([]);
    this.context.lineWidth = 2;
    this.context.strokeRect(dimensions[0] + 1, dimensions[1] + 1, dimensions[2] - 2, dimensions[3] - 2);

    let actualFontSize = this.panel.textSize;
    this.context.font = actualFontSize + 'px "Open Sans", Helvetica, Arial, sans-serif';
    const textMetrics = this.context.measureText(text);

    if(textMetrics.width > dimensions[2])
    {
      actualFontSize = actualFontSize / (textMetrics.width / dimensions[2]);
      if(8 > actualFontSize)
      {
        actualFontSize = 8;
      } else
      {
        actualFontSize = Math.round(actualFontSize * 10) / 10;
      }
      this.context.font = actualFontSize + 'px "Open Sans", Helvetica, Arial, sans-serif';
    }
    this.context.fillText(text, dimensions[0] + 4, dimensions[1] + Math.floor(actualFontSize / 2) + 4);

    this.context.restore();
    return dimensions[2];
  }
  basename(pathname)
  {
    const lastSlashPos = pathname.lastIndexOf("/");
    if(-1 < lastSlashPos)
    {
      return pathname.substring(lastSlashPos + 1, pathname.length);
    } else
    {
      return pathname;
    }
  }
  queryForChilds(paramObj) {
    const jobStr = paramObj.point.val;
    let jobId = -1;
    let jobstepId = -1;
    if(-1 < jobStr.indexOf("."))
    {
      jobId = parseInt(jobStr.split(".")[0]);
      jobstepId = parseInt(jobStr.split(".")[1]);
    } else {
      jobId = parseInt(jobStr);
      if(this.panel.formatMetricsProcessMonitor)
      {
        jobstepId = 4294967294;
      } else
      {
        jobstepId = 0;
      }
    }
    this.doSqlQuery("SELECT execution_instance.pid,execution_instance.tid,execution_instance.ppid,execution_instance.ptid,execution_instance.start,execution_instance.end,mmap_filenames.filename,execution_instance.boottime,execution_instance.hostname FROM execution_instance INNER JOIN mmap_filenames ON mmap_filenames.fid=execution_instance.fid WHERE job_id=" + jobId + " AND jobstep_id=" + jobstepId, this.processQueryForChilds, paramObj);
  }
  processQueryForChilds(myself, columnDesc, rowData, paramObj)
  {
    //console.log(rowData)
    const locationIndex = [0, 0];
    for(let i = 0; i < myself.data.length; ++i)
    {
      for(let j = 0; j < myself.data[i].changes.length; ++j)
      {
        if(myself.data[i].changes[j].val == paramObj.point.val)
        {
          locationIndex[0] = i;
          locationIndex[1] = j;
          break;
        }
      }
    }
    myself.showChilds = {
      "i": locationIndex[0],
      "j": locationIndex[1],
      "pid": rowData[0][0],
      "tid": rowData[0][1],
      "ppid": rowData[0][2],
      "ptid": rowData[0][3],
      "start": rowData[0][4],
      "end": rowData[0][5],
      "filename": "" + rowData[0][6],
      "childs": null,
      "subqueryProcessed": false
     };
    setTimeout(function(selfReference) { return function() {selfReference.checkShowChildsLoaded();};}(myself), 150);
    myself.recursivelyQueryForChilds(rowData[0][0], myself.showChilds);
  }
  checkShowChildsLoaded()
  {
    if("object" == (typeof this))
    {
      if(this.recursivelyCheckShowChildsLoaded(this.showChilds))
      {
        this._renderChilds();
      } else
      {
        setTimeout(function(selfReference) { return function() {selfReference.checkShowChildsLoaded();};}(this), 150);
      }
    } else
    {
      console.log("Can't check if childs have been loaded, \"this\" is not pointing to an object!");
    }
  }
  recursivelyCheckShowChildsLoaded(parent)
  {
    if(!parent.subqueryProcessed)
    {
      return false;
    }
    let allFinished = true;
    if(parent.childs)
    {
      for(let i = 0; i < parent.childs; ++i)
      {
        if(!this.recursivelyCheckShowChildsLoaded(parent.childs[i]))
        {
          return false;
        }
      }
    }
    return allFinished;
  }
  recursivelyQueryForChilds(pid, parent)
  {
    this.doSqlQuery("SELECT execution_instance.pid,execution_instance.tid,execution_instance.ppid,execution_instance.ptid,execution_instance.start,execution_instance.end,mmap_filenames.filename,execution_instance.boottime,execution_instance.hostname FROM execution_instance INNER JOIN mmap_filenames ON mmap_filenames.fid=execution_instance.fid WHERE ppid=" + pid, this.recursivelyProcessQueryForChilds, {"pid": pid, "parent": parent});
  }
  recursivelyProcessQueryForChilds(myself, columnDesc, rowData, paramPid)
  {
    //console.log("recursivelyProcessQueryForChilds");
    if(rowData && 0 < rowData.length)
    {
      const parentPidLocation = paramPid.parent;
      for(let i = 0; i < rowData.length; ++i)
      {
        // enter the data at the correct location in the this.showChilds process tree
        if (0 == i)
        {
          parentPidLocation.childs = new Array();
        }
        parentPidLocation.childs.push({
          "pid": rowData[i][0],
          "tid": rowData[i][1],
          "ppid": rowData[i][2],
          "ptid": rowData[i][3],
          "start": rowData[i][4],
          "end": rowData[i][5],
          "filename": rowData[i][6],
          "childs": null,
          "subqueryProcessed": false
        });

        // query for more childs, only if pid != ppid
        if(rowData[i][0] != rowData[i][2])
        {
          myself.doSqlQuery("SELECT execution_instance.pid,execution_instance.tid,execution_instance.ppid,execution_instance.ptid,execution_instance.start,execution_instance.end,mmap_filenames.filename,execution_instance.boottime,execution_instance.hostname FROM execution_instance INNER JOIN mmap_filenames ON mmap_filenames.fid=execution_instance.fid WHERE ppid=" + rowData[i][0] + "AND boottime=" + rowData[i][7] + " AND hostname=\"" + rowData[i][8] + "\"", myself.recursivelyProcessQueryForChilds, {"pid": rowData[i][0], "parent": parentPidLocation.childs[parentPidLocation.childs.length - 1]});
        }
      }
    }
    paramPid.parent.subqueryProcessed = true;
    //console.log(myself.showChilds);
  }
  doSqlQuery(querySql: String, callback: Function, someObj: Object)
  {
    const grafanaOrgId = 1; //TODO: fetch this from Grafana
    const req = new XMLHttpRequest();
    req.open("POST", "/api/tsdb/query", true);
    req.setRequestHeader("Accept", "application/json, text/plain, */*");
    req.setRequestHeader("X-Grafana-Id", "" + grafanaOrgId);
    req.setRequestHeader("Content-Type", "application/json;charset=utf-8");
    let jsonObj = {
      "from": "0",
      "to": ("" + (new Date()).getTime()),
      "queries": [
        {
          "refId": "A",
          "intervalMs": 60000,
          "maxDataPoints": 1776,
          "datasourceId": grafanaOrgId,
          "rawSql": querySql,
          "format": "table"
        }
      ]
    };
    req.addEventListener("load", function(myself, callback, paramObj) { return function(evt) {
       var obj = JSON.parse(evt.target.response);
       if ("results" in obj && "A" in obj.results && "tables" in obj.results.A && 0 < obj.results.A.tables.length) {
          callback(myself, obj.results.A.tables[0].columns, obj.results.A.tables[0].rows, paramObj);
        } else {
          console.log("Bad Format in JSON response");
          console.log(evt.target.response);
        }
      }; }(this, callback, someObj) );

    req.send(JSON.stringify(jsonObj));
  }
}

export {DiscretePanelCtrl as PanelCtrl};
