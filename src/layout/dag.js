
d3.layout.dag = function () {
    var self_ = {},
        size_ = [1, 1],
        orientation_ = 'tb',
        flip_ = false,
        ordAxis_ = 'x',
        ordIdx_ = 0,
        rankAxis_ = 'y',
        rankIdx_ = 1,
        nodeSeparation_ = 20,
        rankSize_ = 0,
        selfLoopSize_ = 30,
        margin_ = [0, 0, 0, 0],
        userLinks_ = [],
        userNodes_ = [],
        links_ = [],
        nodes_ = [],
        roots_ = [],
        order_ = [];
    
    function flipLinks() {
        var ii, swap, link;
        
        for (ii = 0; ii < userLinks_.length; ++ii) {
            link = userLinks_[ii];
            swap = link.source;
            link.source = link.target;
            link.target = swap;
            link.reversed = !link.reversed;
        }
    }
    
    function removeCycles() {
        var ii, jj, link;
        
        for (ii = 0; ii < nodes_.length; ++ii) delete nodes_[ii].__visited__;
        for (ii = 0; ii < links_.length; ++ii) delete links_[ii].__visited__;

        for (ii = 0; ii < nodes_.length; ++ii) {
            if (nodes_[ii].__visited__) continue;
            
            var stack = [nodes_[ii]];
        
            while (stack.length > 0) {
                var top = stack[stack.length - 1];
            
                delete top.__active__;
            
                for (jj = 0; jj < top.outputs.length; ++jj) {
                    link = top.outputs[jj];
                
                    if (!link.__visited__) {
                        link.__visited__ = true;
                        // If the target is active, it's an ancestor of this node, so this link
                        // is a back/reverse link.
                        if (link.target.__active__) link.__reverse__ = true;
                        else if (!link.target.__visited__) {
                            top.__active__ = true;
                            stack.push(link.target);
                            break;
                        }
                    }
                }
                if (!top.__active__) {
                    top.__visited__ = true;
                    stack.pop();
                }
            }
        }
        
        for (ii = 0; ii < nodes_.length; ++ii) delete nodes_[ii].__visited__;
        
        // Now actually reverse the links that need reversing
        for (ii = 0; ii < links_.length; ++ii) {
            link = links_[ii];
            
            delete link.__visited__;

            if (link.__reverse__) {
                var newLink = {
                    source: link.target,
                    target: link.source,
                    reversed: !link.reversed,
                    userLink: link
                };
                
                delete link.__reverse__;
                
                link.loop = true;
                link.source.outputs.splice(link.source.outputs.indexOf(link), 1);
                link.source.inputs.push(newLink);
                link.target.inputs.splice(link.target.inputs.indexOf(link), 1);
                link.target.outputs.push(newLink);
                links_[ii] = newLink;
            }
        }
    }
        
    function initTree() {
        for (var ii = 0; ii < userNodes_.length; ++ii) {
            var n = userNodes_[ii];
            n.index = ii;
            n.inputs = [];
            n.outputs = [];
        }
        
        nodes_ = userNodes_.slice(0);
        links_ = [];

        for (ii = 0; ii < userLinks_.length; ++ii) {
            var link = userLinks_[ii];

            if (typeof link.source == 'number') {
                if (link.source < 0 || link.source >= userNodes_.length)
                    throw 'Invalid link at index ' + ii +
                        ' (source node ' + link.source + ' does not exist)';
                link.source = userNodes_[link.source];
            }
            if (typeof link.target == 'number') {
                if (link.target < 0 || link.target >= userNodes_.length)
                    throw 'Invalid link at index ' + ii +
                        ' (target node ' + link.target + ' does not exist)';
                link.target = userNodes_[link.target];
            }
            
            // Skip self edges in layout calculations
            if (link.target == link.source) link.loop = true;
            else {
                link.target.inputs.push(link);
                link.source.outputs.push(link);
                links_.push(link);
            }
        }
        
        removeCycles();
        
        roots_ = [];
        for (ii = 0; ii < userNodes_.length; ++ii) {
            if (!userNodes_[ii].inputs.length)
                roots_.push(userNodes_[ii]);
        }
        
    }
    
    function initRanks() {
        var pending = roots_.slice(0), ii;

        for (ii = 0; ii < links_.length; ++ii) delete links_[ii].__visited__;
        
        while (pending.length > 0) {
            var n = pending.pop(), canRank = true, minRank = 0;
            
            for (ii = 0; ii < n.inputs.length; ++ii) {
                if (!n.inputs[ii].__visited__) {
                    canRank = false;
                    break;
                }
                minRank = Math.max(minRank, n.inputs[ii].source.rank + 1);
            }
            
            if (canRank) {
                n.rank = minRank;
                for (ii = 0; ii < n.outputs.length; ++ii) {
                    n.outputs[ii].__visited__ = true;
                    pending.push(n.outputs[ii].target);
                }
            }
        }
        
        for (ii = 0; ii < links_.length; ++ii) delete links_[ii].__visited__;
    }
    
    function addVirtualNodes() {
        var curIndex = nodes_.length,
            newLinks = [],
            ii, jj;
        
        for (ii = 0; ii < links_.length; ++ii) {
            var link = links_[ii];
            
            if (link.target.rank - link.source.rank == 1) {
                newLinks.push(link);
            }
            else {
                // Make virtual nodes
                var newNodes = [];
                
                // Break existing link
                link.source.outputs.splice(link.source.outputs.indexOf(link), 1);
                link.target.inputs.splice(link.target.inputs.indexOf(link), 1);
                
                for (jj = link.source.rank + 1; jj < link.target.rank; ++jj) {
                    newNodes.push({ index: curIndex++, rank: jj, inputs: [], outputs: [], virtual: true });
                }
                
                for (jj = 0; jj <= newNodes.length; ++jj) {
                    var curSource = (jj === 0) ? link.source : newNodes[jj - 1];
                    var curTarget = (jj == newNodes.length) ? link.target : newNodes[jj];
                    var newLink = {
                        source: curSource,
                        target: curTarget,
                        reversed: link.reversed,
                        userLink: link.userLink ? link.userLink : link
                    };
                    newLinks.push(newLink);
                    curSource.outputs.push(newLink);
                    curTarget.inputs.push(newLink);
                }
                
                Array.prototype.push.apply(nodes_, newNodes);
            }
        }
        
        links_ = newLinks;
    }
    
    function rankNodes() {
        initTree(); // Add necessary properties to nodes and links
        initRanks(); // Assign an initial feasible ranking
        // No further optimization of rankings is done for now
        addVirtualNodes();
    }
    
    function initOrder() {
        var visitingNow = roots_.slice(0),
            visitingNext,
            newLen, ii, jj;
        
        order_ = [];
        
        for (ii = 0; ii < nodes_.length; ++ii) nodes_[ii].__visited__ = false;
        
        while (visitingNow.length > 0) {
            visitingNext = [];
            for (ii = 0; ii < visitingNow.length; ++ii) {
                var n = visitingNow[ii];
                
                if (!n.__visited__) {
                    if (typeof order_[n.rank] == 'undefined') order_[n.rank] = [];
                    
                    n.ordinal = order_[n.rank].length;
                    n.__visited__ = true;
                    order_[n.rank].push(n);
                    for (jj = 0; jj < n.outputs.length; ++jj)
                        visitingNext.push(n.outputs[jj].target);
                }
            }
            visitingNow = visitingNext;
        }
        
        for (ii = 0; ii < nodes_.length; ++ii) delete nodes_[ii].__visited__;
    }
    
    function weightedMedianOrdinal(node, reverse) {
        var adjOrdinals = [];
        var adjLinks = reverse ? node.outputs : node.inputs;
        var prop = reverse ? 'target' : 'source';
        
        for (var ii = 0; ii < adjLinks.length; ++ii)
            adjOrdinals.push(adjLinks[ii][prop].ordinal);
        
        var medianIdx = Math.floor(adjOrdinals.length / 2);
        
        if (!adjOrdinals.length)
            return null;
        else if (adjOrdinals.length % 2 == 1)
            return adjOrdinals[medianIdx];
        else if (adjOrdinals.length == 2)
            return (adjOrdinals[0] + adjOrdinals[1]) / 2.0;
        else {
            var left = adjOrdinals[medianIdx - 1] - adjOrdinals[0];
            var right = adjOrdinals[adjOrdinals.length - 1] - adjOrdinals[medianIdx];
            return (adjOrdinals[medianIdx - 1] * right + adjOrdinals[medianIdx] * left) / (left + right);
        }
    }
    
    function orderByMedian(reverse, reverseEqual) {
        var ii, jj, n, rank, medians;
        
        var sortFn = function (a, b) {
            var diff = medians[a.index] - medians[b.index];
            // Swap the order of equal medians on some passes
            if (diff === 0) return reverseEqual ? (a.index - b.index) : (b.index - a.index);
            else return diff;
        };
        
        for (ii = 1; ii < order_.length; ++ii) {
            rank = reverse ? (order_.length - 1 - ii) : ii;
            medians = {};
            
            for (jj = 0; jj < order_[rank].length; ++jj) {
                n = order_[rank][jj];
                medians[n.index] = weightedMedianOrdinal(n, reverse);
            }

            order_[rank].sort(sortFn);

            for (jj = 0; jj < order_[rank].length; ++jj) order_[rank][jj].ordinal = jj;
        }
    }
    
    function countCrossings(left, right) {
        var crossingCount = 0;
        
        for (var mm = 0; mm < left.outputs.length; ++mm)
            for (var nn = 0; nn < right.outputs.length; ++nn)
                if (left.outputs[mm].target.ordinal > right.outputs[nn].target.ordinal)
                    crossingCount++;
        
        return crossingCount;
    }
    
    function countAllCrossings() {
        var crossingCount = 0,
            rr, rankOrder, ii, jj;
        
        for (rr = 0; rr < order_.length - 1; ++rr) {
            rankOrder = order_[rr];

            for (ii = 0; ii < rankOrder.length - 1; ++ii) {
                for (jj = ii + 1; jj < rankOrder.length; ++jj) {
                    crossingCount += countCrossings(rankOrder[ii], rankOrder[jj]);
                }
            }
        }
        
        return crossingCount;
    }
    
    function saveOrder() {
        var newOrder = [];
        for (var ii = 0; ii < order_.length; ++ii) newOrder[ii] = order_[ii].slice(0);
        return newOrder;
    }
    
    function transposeOrder() {
        var improved = true;
        
        while (improved) {
            improved = false;
            for (var ii = 0; ii < order_.length; ++ii) {
                var rank = order_[ii];
                for (var jj = 0; jj < rank.length - 1; ++jj) {
                    if (countCrossings(rank[jj], rank[jj + 1]) > countCrossings(rank[jj + 1], rank[jj])) {
                        improved = true;
                        rank[jj].ordinal = jj + 1;
                        rank[jj + 1].ordinal = jj;

                        var swap = rank[jj];
                        rank[jj] = rank[jj + 1];
                        rank[jj + 1] = swap;
                    }
                }
            }
        }
    }
    
    function orderNodes() {
        initOrder();
        
        var bestOrder = saveOrder(),
            curCrossings = countAllCrossings(),
            minCrossings = curCrossings,
            ii, jj;
        
        for (ii = 0; ii < 24 && minCrossings > 0; ++ii) {
            orderByMedian(ii % 2 == 1, ii % 3 === 0);
            transposeOrder();
            curCrossings = countAllCrossings();
            if (curCrossings < minCrossings) {
                minCrossings = curCrossings;
                bestOrder = saveOrder();
            }
        }
        
        // Apply best order
        order_ = bestOrder;
        for (ii = 0; ii < order_.length; ++ii)
            for (jj = 0; jj < order_[ii].length; ++jj)
                order_[ii][jj].ordinal = jj;
    }
    
    function linkPriority(link) {
        if (link.source.virtual && link.target.virtual) return 8;
        else if (link.source.virtual || link.target.virtual) return 2;
        else return 1;
    }
    
    function scorePosition() {
        var score = 0;
        
        for (var ii = 0; ii < links_.length; ++ii) {
            var link = links_[ii];
            score += linkPriority(link) * Math.abs(link.target[ordAxis_] - link.source[ordAxis_]);
        }
        
        return score;
    }
    
    function saveNodePosition() {
        var pos = [];
        for (var ii = 0; ii < nodes_.length; ++ii) pos[ii] = nodes_[ii][ordAxis_];
        return pos;
    }

    function medianPosition(node, upward) {
        var adjValues = [];
        var adjDir = upward ? 'inputs' : 'outputs';
        var adjSide = upward ? 'source' : 'target';
        var adjLinks = node[adjDir];
        
        for (var ii = 0; ii < adjLinks.length; ++ii)
            adjValues.push(adjLinks[ii][adjSide][ordAxis_]);
        
        var medianIdx = Math.floor(adjValues.length / 2);
        
        if (!adjValues.length)
            return null;
        else if (adjValues.length % 2 == 1)
            return adjValues[medianIdx];
        else
            return (adjValues[medianIdx - 1] + adjValues[medianIdx]) / 2.0;
    }
    
    function positionNodesByMedian(upward) {
        var adjDir = upward ? 'inputs' : 'outputs';
        var adjSide = upward ? 'source' : 'target';
        var priorityProp = upward ? 'priorityUp' : 'priorityDown';
        var sortFn = function (a, b) { return b[priorityProp] - a[priorityProp]; };
        
        for (var ii = 1; ii < order_.length; ++ii) {
            var rankIdx = upward ? ii : (order_.length - 1 - ii);
            var rank = order_[rankIdx].slice(0);
            
            rank.sort(sortFn);
            
            for (var jj = 0; jj < rank.length; ++jj) {
                var node = rank[jj];
                var median = medianPosition(node, upward);
                // Must leave room for the earlier nodes in the rank (and some margin)
                var pos = Math.max(node.ordinal * nodeSeparation_ + nodeSeparation_, median);
                
                // Also, higher-priority nodes already have their positions set
                for (var kk = 0; kk < jj; ++kk) {
                    if (rank[kk].ordinal < node.ordinal)
                        pos = Math.max(pos, rank[kk][ordAxis_] + nodeSeparation_ *
                            (node.ordinal - rank[kk].ordinal));
                    else
                        pos = Math.min(pos, rank[kk][ordAxis_] - nodeSeparation_ *
                            (rank[kk].ordinal - node.ordinal));
                }

                node[ordAxis_] = pos;
                /*console.log('node ' + node.index + ': rank=' + node.rank +
                    ' ordinal=' + node.ordinal + ' median=' + median + ' ' + ordAxis_ + '=' + pos);*/
            }
        }
    }
    
    function normalizePositions() {
        var minPos = Infinity,
            curMargin = margin_[(ordIdx_ + 3) % 4],
            ii;
        
        for (ii = 0; ii < nodes_.length; ++ii) {
            nodes_[ii][ordAxis_] = Math.round(nodes_[ii][ordAxis_]);
            minPos = Math.min(minPos, nodes_[ii][ordAxis_]);
        }
        if (minPos > curMargin) {
            for (ii = 0; ii < nodes_.length; ++ii) nodes_[ii][ordAxis_] -= minPos - curMargin;
        }
    }
    
    function sizeToFit() {
        var maxPos = 0;
        
        for (var ii = 0; ii < nodes_.length; ++ii) maxPos = Math.max(maxPos, nodes_[ii][ordAxis_]);
        size_[ordIdx_] = maxPos + margin_[ordIdx_ + 1];
    }
    
    function positionNodes() {
        var rankSpans = [],
            rankSum = 0,
            ii, jj;
        
        // Compute rank start positions. Check the user-requested rank spans and distribute the
        // nodes accordingly to fill the available space. Also respect 'bt' and 'rl' orientations.
        for (ii = 0; ii < order_.length - 1; ++ii) {
            rankSpans[ii] = 1;
            for (jj = 0; jj < order_[ii].length; ++jj)
                if (order_[ii][jj].rankSpan)
                    rankSpans[ii] = Math.max(rankSpans[ii], order_[ii][jj].rankSpan);
            
            rankSum += rankSpans[ii];
        }
        
        var usableSpace = size_[rankIdx_] - margin_[rankIdx_ + 1] - margin_[(rankIdx_ + 3) % 4],
            rankPos = [],
            nextRankPos = 0;

        rankSize_ = usableSpace / rankSum;
        
        for (ii = 0; ii < order_.length; ++ii) {
            rankPos[ii] = (orientation_ == 'rl' || orientation_ == 'bt') ?
                          (size_[rankIdx_] - margin_[rankIdx_ + 1] - nextRankPos) : nextRankPos;
            nextRankPos += Math.round(rankSize_ * rankSpans[ii]);
        }
        
        // Compute node priorities and assign initial positions.
        for (ii = 0; ii < nodes_.length; ++ii) {
            var node = nodes_[ii];
            node[ordAxis_] = node.ordinal * nodeSeparation_ + margin_[(ordIdx_ + 3) % 4];
            node[rankAxis_] = rankPos[node.rank];
            node.priorityUp = node.priorityDown = 0;
            
            for (jj = 0; jj < node.inputs.length; ++jj)
                node.priorityUp += linkPriority(node.inputs[jj]);

            for (jj = 0; jj < node.outputs.length; ++jj)
                node.priorityDown += linkPriority(node.outputs[jj]);
        }
        
        // Optimize positions
        var curScore = scorePosition(),
            minScore = curScore,
            bestPosition = saveNodePosition();
        
        for (ii = 0; ii < 8; ++ii) {
            positionNodesByMedian(ii % 2 === 0);
            curScore = scorePosition();
            //console.log('new score: ' + curScore);
            if (curScore < minScore) {
                minScore = curScore;
                bestPosition = saveNodePosition();
            }
        }
        
        // Apply best position
        for (ii = 0; ii < nodes_.length; ++ii) nodes_[ii][ordAxis_] = bestPosition[ii];
        
        // Fit layout to size as best as possible, then adjust size to fit layout
        normalizePositions();
        sizeToFit();
    }
    
    function generatePaths() {
        var ii, link;
        
        // Handle self-links that we ignored in the layout
        for (ii = 0; ii < userLinks_.length; ++ii) {
            link = userLinks_[ii];
            if (link.source == link.target) {
                var pt1 = {}, pt2 = {}, pt3 = {}, pt4 = {},
                    loopRankSize = Math.min(selfLoopSize_, rankSize_ / 2);
                
                pt1[ordAxis_] = pt2[ordAxis_] = link.source[ordAxis_] - nodeSeparation_ / 2;
                pt3[ordAxis_] = pt4[ordAxis_] = link.source[ordAxis_] + nodeSeparation_ / 2;
                pt1[rankAxis_] = pt4[rankAxis_] = link.source[rankAxis_];
                pt2[rankAxis_] = pt3[rankAxis_] = link.source[rankAxis_] + loopRankSize;
                link.path = [link.source, pt1, pt2, pt3, pt4, link.source];
            }
        }
        
        // Now generate the real paths
        for (ii = 0; ii < links_.length; ++ii) {
            link = links_[ii];
            
            if (!link.source.virtual) {
                var curTarget = link.target;
                var path = [link.source, curTarget];
                
                while (curTarget.virtual && curTarget.outputs.length)
                    path.push(curTarget = curTarget.outputs[0].target);

                if (link.reversed) path.reverse();
                
                if (link.userLink) link.userLink.path = path;
                else link.path = path;
            }
        }
    }
    
    self_.size = function (x) {
        if (!arguments.length) return size_;
        size_ = x;
        return self_;
    };
    
    self_.orientation = function (x) {
        if (!arguments.length) return orientation_;
        orientation_ = x;
        return self_;
    };
    
    self_.flip = function (x) {
        if (!arguments.length) return flip_;
        flip_ = x;
        return self_;
    };
    
    self_.nodeSeparation = function (x) {
        if (!arguments.length) return nodeSeparation_;
        nodeSeparation_ = x;
        return self_;
    };
    
    self_.margin = function (x) {
        if (!arguments.length) return margin_;
        if (x.length == 4) margin_ = x;
        return self_;
    };
    
    self_.links = function (x) {
        if (!arguments.length) return userLinks_;
        userLinks_ = x;
        return self_;
    };

    self_.nodes = function (x) {
        if (!arguments.length) return userNodes_;
        userNodes_ = x;
        return self_;
    };
    
    self_.paths = function () {
        return userLinks_.map(function (link) { return link.path; });
    };
    
    self_.start = function () {
        if (orientation_ == 'lr' || orientation_ == 'rl') {
            ordAxis_ = 'y';
            ordIdx_ = 1;
            rankAxis_ = 'x';
            rankIdx_ = 0;
        }
        else {
            ordAxis_ = 'x';
            ordIdx_ = 0;
            rankAxis_ = 'y';
            rankIdx_ = 1;
        }
        
        if (flip_) flipLinks();
        
        rankNodes();
        orderNodes();
        positionNodes();
        generatePaths();
        
        // If flipping is enabled, flip links back when done
        if (flip_) flipLinks();
        
        //console.log(nodes_);
        return self_;
    };
    
    return self_;
};
